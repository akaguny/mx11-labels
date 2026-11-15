// ===== Режим «QR-ключ»: подбор версии/коррекции QR и рендер на canvas =====
// Чистая логика: без DOM на верхнем уровне, без сети и хранилищ — импортируется
// и приложением, и node-скриптом tools/qr-fit.mjs. Текст ключа нигде не логируется.
import qrcode from '../vendor/qrcode.js';
import { PX_PER_MM, LABEL_MAX_MM } from './protocol.js';

// По умолчанию вендоренный генератор кодирует строку как Latin-1 (c & 0xff) —
// кириллица превратилась бы в мусор. Для ASCII (QR наклеек) результат тот же.
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

export const QR_EC_ORDER = ['H', 'Q', 'M', 'L'];
export const QR_PAD = 8;                 // белое поле со всех сторон, точек
export const QR_QUIET = 8;               // quiet zone: 4 модуля × 2 стороны
export const QR_MIN_SIDE_MM = 20;
export const QR_MAX_SIDE_MM = LABEL_MAX_MM;   // 48 мм — вся ширина печати
export const QR_DEFAULT_SIDE_MM = 40;
export const QR_MAX_CHARS = 2000;
export const QR_MAX_CAPTION = 60;
export const QR_GOOD_MODULE = 3;         // 3 точки = 0.375 мм — уверенное чтение
export const QR_MIN_MODULE = 2;          // меньше — не читается
export const QR_STRIP_MM = 6;            // вертикальная полоса подписи слева от QR
export const QR_GAP_MM = 2;              // зазор между полосой и QR
export const QR_STRIP_DOTS = QR_STRIP_MM * PX_PER_MM;   // 48
export const QR_GAP_DOTS = QR_GAP_MM * PX_PER_MM;       // 16
// Максимальная сторона QR при непустой подписи: 48 − 6 − 2 = 40 мм (иначе W > 384).
export const QR_MAX_SIDE_CAPTION_MM = LABEL_MAX_MM - QR_STRIP_MM - QR_GAP_MM;
const CAPTION_FS_MAX = 16, CAPTION_FS_MIN = 10, CAPTION_STRIP_MARGIN = 4;

// Подпись: пробелы схлопываются, края обрезаются.
export function normCaption(caption) {
  return String(caption || '').replace(/\s+/g, ' ').trim();
}

// Эффективная сторона QR (мм): при непустой подписи не больше 40 мм. Поле ввода не трогаем.
export function effectiveSide(sideMm, caption) {
  const side = clampSide(sideMm);
  return normCaption(caption) ? Math.min(side, QR_MAX_SIDE_CAPTION_MM) : side;
}

// Геометрия этикетки (точки), без DOM. stripDots — ширина полосы подписи (0 без подписи).
// Без подписи W = H = сторона QR; с подписью W = сторона + полоса + зазор, H = сторона.
export function qrKeyGeometry(qrSideDots, hasCaption) {
  const stripDots = hasCaption ? QR_STRIP_DOTS : 0;
  const gap = hasCaption ? QR_GAP_DOTS : 0;
  return { W: qrSideDots + stripDots + gap, H: qrSideDots, stripDots, qrSideDots };
}

export function clampSide(v) {
  const n = Math.round(+v);
  if (!Number.isFinite(n)) return QR_DEFAULT_SIDE_MM;
  return Math.min(QR_MAX_SIDE_MM, Math.max(QR_MIN_SIDE_MM, n));
}

// Минимальная сторона (мм), при которой модуль QR из n модулей = 3 точки.
export function minSideMm(n) {
  return Math.ceil(((n + QR_QUIET) * QR_GOOD_MODULE + 2 * QR_PAD) / PX_PER_MM);
}

// Подбор уровня коррекции: H → Q → M → L, берём первый вариант с модулем ≥ 3;
// иначе первый с модулем 2 (warn); иначе печать блокируется (reason).
// Возвращает { ok, warn, reason, needMm, qr, ec, version, n, modulePx, sideMm, sideDots, chars }.
// reason: 'empty' | 'tooMuch' (не лезет ни в один QR ≤ 48 мм) | 'needMm' (нужна бо́льшая сторона).
export function fitQr(text, sideMm) {
  const s = String(text ?? '');
  const side = clampSide(sideMm);
  const sideDots = side * PX_PER_MM;
  const res = { ok: false, warn: false, reason: null, needMm: 0, qr: null, ec: null,
                version: 0, n: 0, modulePx: 0, sideMm: side, sideDots, chars: s.length };
  if (!s.trim()) return { ...res, reason: 'empty' };

  const variants = [];
  for (const ec of QR_EC_ORDER) {
    try {
      const qr = qrcode(0, ec);
      qr.addData(s);
      qr.make();
      const n = qr.getModuleCount();
      variants.push({ ec, qr, n, modulePx: Math.floor((sideDots - 2 * QR_PAD) / (n + QR_QUIET)) });
    } catch (e) { /* переполнение — пробуем меньший уровень коррекции */ }
  }
  if (!variants.length) return { ...res, reason: 'tooMuch' };

  const smallest = variants.reduce((a, b) => (b.n < a.n ? b : a));
  const need = minSideMm(smallest.n);
  const pick = variants.find(v => v.modulePx >= QR_GOOD_MODULE)
            || variants.find(v => v.modulePx === QR_MIN_MODULE);
  if (!pick) {
    return { ...res, n: smallest.n, needMm: need, reason: need > QR_MAX_SIDE_MM ? 'tooMuch' : 'needMm' };
  }
  return { ...res, ok: true, warn: pick.modulePx < QR_GOOD_MODULE, qr: pick.qr, ec: pick.ec,
           n: pick.n, version: (pick.n - 17) / 4, modulePx: pick.modulePx, needMm: need };
}

// Подпись в вертикальной полосе: кегль 16 → 10 px, один ряд вдоль полосы (длина maxLen точек).
// Максимальный кегль, при котором строка влезает по длине и по ширине полосы (fs ≤ полоса − 4);
// не влезает и на 10 px — обрезаем с «…». Возвращает { fs, text, width }.
export function layoutSideCaption(ctx, caption, maxLen, stripDots = QR_STRIP_DOTS) {
  const fsMax = Math.min(CAPTION_FS_MAX, stripDots - CAPTION_STRIP_MARGIN);
  for (let fs = fsMax; fs >= CAPTION_FS_MIN; fs--) {
    ctx.font = `bold ${fs}px Arial, sans-serif`;
    const width = ctx.measureText(caption).width;
    if (width <= maxLen) return { fs, text: caption, width };
  }
  ctx.font = `bold ${CAPTION_FS_MIN}px Arial, sans-serif`;
  let line = caption;
  while (line.length > 1 && ctx.measureText(line + '…').width > maxLen) line = line.slice(0, -1);
  const text = line + '…';
  return { fs: CAPTION_FS_MIN, text, width: ctx.measureText(text).width };
}

// Рисует этикетку на canvas: белый фон, модули fillRect без сглаживания, без рамки.
// Подпись (если есть) — повёрнута на 90° в полосе слева от QR, читается снизу вверх.
// Если fit.ok = false — просто белый холст. Возвращает { W, H, stripDots, qrSideDots }.
export function renderQrKey(canvas, fit, caption = '') {
  const cap = normCaption(caption);
  const geo = qrKeyGeometry(fit.sideDots, !!cap);
  const { W, H, stripDots, qrSideDots } = geo;
  canvas.width = W; canvas.height = H;                  // сбрасывает состояние контекста
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  if (!fit.ok) return geo;

  const { n, modulePx: m, qr } = fit;
  const qrX = W - qrSideDots;                           // левый край квадрата QR (после полосы и зазора)
  const x0 = qrX + Math.floor((qrSideDots - n * m) / 2), y0 = Math.floor((qrSideDots - n * m) / 2);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect(x0 + c * m, y0 + r * m, m, m);

  if (cap) {
    const maxLen = H - 2 * QR_PAD;
    const { fs, text, width } = layoutSideCaption(ctx, cap, maxLen, stripDots);
    ctx.save();
    ctx.translate(stripDots / 2, H);                    // начало — низ полосы, текст идёт вверх
    ctx.rotate(-Math.PI / 2);
    ctx.font = `bold ${fs}px Arial, sans-serif`;
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, QR_PAD + (maxLen - width) / 2, 0);
    ctx.restore();
  }
  return geo;
}
