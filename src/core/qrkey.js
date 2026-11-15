// ===== Режим «QR-ключ»: подбор версии/коррекции QR и рендер на canvas =====
// Чистая логика: без DOM на верхнем уровне, без сети и хранилищ — импортируется
// и приложением, и node-скриптом tools/qr-fit.mjs. Текст ключа нигде не логируется.
import qrcode from '../vendor/qrcode.js';
import { PX_PER_MM, LABEL_MAX_MM } from './protocol.js';
import { wrapText } from './label.js';

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
export const QR_MAX_CAPTION = 40;
export const QR_GOOD_MODULE = 3;         // 3 точки = 0.375 мм — уверенное чтение
export const QR_MIN_MODULE = 2;          // меньше — не читается
const CAPTION_FS_MAX = 16, CAPTION_FS_MIN = 10, CAPTION_GAP = 4;

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

// Подпись: кегль 16 → 10 px, ≤ 2 строк; если не влезает — одна строка с «…».
function layoutCaption(ctx, caption, maxW) {
  for (let fs = CAPTION_FS_MAX; fs >= CAPTION_FS_MIN; fs--) {
    ctx.font = `bold ${fs}px Arial, sans-serif`;
    const lines = wrapText(ctx, caption, maxW);
    if (lines.length <= 2 && lines.every(l => ctx.measureText(l).width <= maxW)) {
      return { fs, lines };
    }
  }
  ctx.font = `bold ${CAPTION_FS_MIN}px Arial, sans-serif`;
  let line = caption;
  while (line.length > 1 && ctx.measureText(line + '…').width > maxW) line = line.slice(0, -1);
  return { fs: CAPTION_FS_MIN, lines: [line + '…'] };
}

// Рисует этикетку на canvas: белый фон, модули fillRect без сглаживания, без рамки.
// Если fit.ok = false — просто белый квадрат. Возвращает { W, H } в точках.
export function renderQrKey(canvas, fit, caption = '') {
  const W = fit.sideDots;
  const cap = String(caption || '').replace(/\s+/g, ' ').trim();
  let capLayout = null;
  if (fit.ok && cap) {
    canvas.width = W; canvas.height = W + 64;           // временный размер — только для measureText
    capLayout = layoutCaption(canvas.getContext('2d', { willReadFrequently: true }), cap, W - 2 * QR_PAD);
    capLayout.lh = Math.round(capLayout.fs * 1.15);
  }
  const H = W + (capLayout ? capLayout.lines.length * capLayout.lh + CAPTION_GAP : 0);
  canvas.width = W; canvas.height = H;                  // сбрасывает состояние контекста
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  if (!fit.ok) return { W, H };

  const { n, modulePx: m, qr } = fit;
  const x0 = Math.floor((W - n * m) / 2), y0 = x0;
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect(x0 + c * m, y0 + r * m, m, m);

  if (capLayout) {
    ctx.font = `bold ${capLayout.fs}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    let y = W + CAPTION_GAP / 2;
    for (const l of capLayout.lines) { ctx.fillText(l, W / 2, y); y += capLayout.lh; }
  }
  return { W, H };
}
