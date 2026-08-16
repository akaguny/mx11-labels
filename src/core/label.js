// ===== Отрисовка наклейки на canvas (чистая логика, без DOM) =====
// Перенос из v14: QR слева, текст справа с автоподбором кегля, рамка,
// поворот на 90° для длинных наклеек, схема ленты, калибровка.
import qrcode from '../vendor/qrcode.js';
import { PRINT_WIDTH, PX_PER_MM, LABEL_MAX_MM } from './protocol.js';

export const LABEL_MAX_LONG_MM = 200;   // предел длины вдоль ленты
export const TAPE_MM = 57, DEAD_MM = (TAPE_MM - LABEL_MAX_MM) / 2;  // 4.5 мм с краёв

export function composeName({ brand = '', type = '', color = '' } = {}) {
  return [brand, type, color].map(s => String(s).trim()).filter(Boolean).join(' ');
}

export function googleUrl(name) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(name);
}

// QR с уровнем M, при переполнении — L (кириллица в URL длинная).
export function makeQr(text) {
  for (const ec of ['M', 'L']) {
    try {
      const qr = qrcode(0, ec);
      qr.addData(text);
      qr.make();
      return qr;
    } catch (e) { /* переполнение — пробуем меньший уровень коррекции */ }
  }
  return null;
}

// Ориентация: 'auto' → вдоль ленты, если ширина > 48 мм.
export function orientation(mode, wMm) {
  if (mode !== 'auto') return mode;
  return (+wMm || 0) > LABEL_MAX_MM ? 'along' : 'across';
}

// Сдвиг наклейки поперёк ленты в точках (0 — вплотную к началу зоны печати).
export function offsetDots(offMm, usedDots) {
  const maxMm = (PRINT_WIDTH - usedDots) / PX_PER_MM;
  const mm = Math.min(maxMm, Math.max(0, +offMm || 0));
  return Math.round(mm * PX_PER_MM);
}

// Параметры компоновки наклейки (ограничения зависят от ориентации).
export function layout(wMm, hMm, orientMode) {
  const along = orientation(orientMode, wMm) === 'along';
  const maxWmm = along ? LABEL_MAX_LONG_MM : LABEL_MAX_MM;
  const maxHmm = along ? LABEL_MAX_MM : 40;
  const w = Math.min(maxWmm, Math.max(20, +wMm || LABEL_MAX_MM));
  const h = Math.min(maxHmm, Math.max(8, +hMm || 15));
  return { along, maxWmm, maxHmm, wMm: w, hMm: h,
           W: Math.round(w * PX_PER_MM), H: Math.round(h * PX_PER_MM) };
}

// Главный рендер: рисует наклейку на canvas.
// opts: { brand, type, color, note, wMm, hMm, orient, offMm, border, screenCal }
export function renderLabel(canvas, opts = {}) {
  const l = layout(opts.wMm, opts.hMm, opts.orient || 'auto');
  const { W, H } = l;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  const name = composeName(opts);
  const note = String(opts.note || '').trim();
  const usedDots = l.along ? H : W;
  const off = offsetDots(opts.offMm, usedDots);

  if (opts.border !== false) {
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }
  if (!name) {
    ctx.fillStyle = '#000';
    ctx.font = 'italic 16px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('—', W / 2, H / 2);
    return { ...l, name: '', usedDots, off };
  }

  // --- QR слева ---
  const pad = 8;
  let textX = pad + 2;
  const qr = makeQr(googleUrl(name));
  if (qr) {
    const n = qr.getModuleCount();
    const cell = Math.max(1, Math.floor((H - 2 * pad) / n));
    const q = cell * n;
    const qx = pad, qy = Math.round((H - q) / 2);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, cell, cell);
    textX = qx + q + 10;
  }

  // --- Текст справа: подбор кегля от 40 до 10, ≤3 строк ---
  const maxW = W - textX - pad;
  const lineGap = 1.15;
  const noteH = note ? 17 : 0;
  let chosen = null;
  for (let fs = 40; fs >= 10; fs--) {
    ctx.font = `bold ${fs}px Arial, sans-serif`;
    const lines = wrapText(ctx, name, maxW);
    const total = lines.length * fs * lineGap + noteH;
    if (lines.length <= 3 && total <= H - 2 * pad &&
        lines.every(l => ctx.measureText(l).width <= maxW)) {
      chosen = { fs, lines };
      break;
    }
  }
  if (!chosen) chosen = { fs: 10, lines: [name] };

  ctx.fillStyle = '#000';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = `bold ${chosen.fs}px Arial, sans-serif`;
  const blockH = chosen.lines.length * chosen.fs * lineGap + noteH;
  let y = Math.max(pad, Math.round((H - blockH) / 2));
  for (const l of chosen.lines) {
    ctx.fillText(l, textX, y, maxW);
    y += Math.round(chosen.fs * lineGap);
  }
  if (note) {
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText(note, textX, Math.min(y + 1, H - pad - 13), maxW);
  }
  return { ...l, name, usedDots, off };
}

export function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// canvas → строки битов (1 = чёрный), всегда шириной PRINT_WIDTH.
// Неиспользованная часть строки остаётся незапечатанной.
// Вдоль ленты растр поворачивается на 90°.
export function canvasToRows(canvas, orientMode, offMm) {
  const { width: W, height: H } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, W, H).data;
  const dark = (x, y) => {
    const i = (y * W + x) * 4;
    return ((data[i] + data[i + 1] + data[i + 2]) / 3) < 140 ? 1 : 0;
  };
  const along = orientation(orientMode, W / PX_PER_MM) === 'along';
  const off = offsetDots(offMm, along ? H : W);
  const rows = [];
  if (!along) {
    for (let y = 0; y < H; y++) {
      const row = new Array(PRINT_WIDTH).fill(0);
      for (let x = 0; x < W && x + off < PRINT_WIDTH; x++) row[x + off] = dark(x, y);
      rows.push(row);
    }
  } else {
    // поворот на 90° по часовой стрелке: строка печати ← столбец наклейки
    for (let ny = 0; ny < W; ny++) {
      const row = new Array(PRINT_WIDTH).fill(0);
      for (let nx = 0; nx < H && nx + off < PRINT_WIDTH; nx++) row[nx + off] = dark(ny, H - 1 - nx);
      rows.push(row);
    }
  }
  return rows;
}
