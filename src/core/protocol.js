// ===== Протокол MX11 (V5G family, по kcvv/mx11_printer) =====
// Прямой перенос из проверенного v14 (НаклейкифиламентаMX11 (4).html + mx11_labels.py).
// Кадр команды:  51 78 <cmd> 00 <len_lo> <len_hi> <payload...> <crc> ff
// crc — табличный CRC-8 по payload. Строка растра: RLE (bf) либо побитно (a2),
// 384 точки, младший бит байта — левый пиксель.

export const PRINT_WIDTH = 384;   // точек в строке термоголовки
export const PX_PER_MM = 8;       // 8 точек/мм = 203.2 dpi; 384 точки = ровно 48 мм
export const LABEL_MAX_MM = PRINT_WIDTH / PX_PER_MM;   // 48 мм

const CHECKSUM_TABLE = new Uint8Array([
  0,7,14,9,28,27,18,21,56,63,54,49,36,35,42,45,112,119,126,121,
  108,107,98,101,72,79,70,65,84,83,90,93,224,231,238,233,252,251,
  242,245,216,223,214,209,196,195,202,205,144,151,158,153,140,
  139,130,133,168,175,166,161,180,179,186,189,199,192,201,206,
  219,220,213,210,255,248,241,246,227,228,237,234,183,176,185,190,
  171,172,165,162,143,136,129,134,147,148,157,154,39,32,41,
  46,59,60,53,50,31,24,17,22,3,4,13,10,87,80,89,94,75,76,69,66,
  111,104,97,102,115,116,125,122,137,142,135,128,149,146,155,
  156,177,182,191,184,173,170,163,164,249,254,247,240,229,226,235,236,
  193,198,207,200,221,218,211,212,105,110,103,96,117,114,123,124,81,
  86,95,88,77,74,67,68,25,30,23,16,5,2,11,12,33,38,47,40,61,58,
  51,52,78,73,64,71,82,85,92,91,118,113,120,127,106,109,100,99,62,
  57,48,55,34,37,44,43,6,1,8,15,26,29,20,19,174,169,160,167,178,
  181,188,187,150,145,152,159,138,141,132,131,222,217,208,215,
  194,197,204,203,230,225,232,239,250,253,244,243
]);

function chkSum(arr, i, n) {
  let b = 0;
  for (let k = i; k < i + n; k++) b = CHECKSUM_TABLE[(b ^ arr[k]) & 0xff];
  return b;
}

const CMD_SET_QUALITY_200_DPI = [0x51,0x78,0xa4,0x00,0x01,0x00,0x32,0x9e,0xff];
const CMD_LATTICE_START = [0x51,0x78,0xa6,0x00,0x0b,0x00,0xaa,0x55,0x17,0x38,0x44,0x5f,0x5f,0x5f,0x44,0x38,0x2c,0xa1,0xff];
const CMD_LATTICE_END   = [0x51,0x78,0xa6,0x00,0x0b,0x00,0xaa,0x55,0x17,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x17,0x11,0xff];
export const CMD_GET_STATUS    = [0x51,0x78,0xa3,0x00,0x01,0x00,0x00,0x00,0xff];

function cmdSetEnergy(v) {
  const a = [0x51,0x78,0xaf,0x00,0x02,0x00,(v>>8)&0xff,v&0xff,0x00,0xff];
  a[8] = chkSum(a, 6, 2);
  return a;
}
function cmdApplyEnergy() {
  const a = [0x51,0x78,0xbe,0x00,0x01,0x00,0x01,0x00,0xff];
  a[7] = chkSum(a, 6, 1);
  return a;
}
export function cmdFeedPaper(lines) {
  const a = [0x51,0x78,0xa1,0x00,0x02,0x00,lines&0xff,0x00,0x00,0xff];
  a[8] = chkSum(a, 6, 2);
  return a;
}

// Тонкая линия отреза между наклейками серии: n строк растра, все точки чёрные.
// 2 строки = 0.25 мм — хорошо видно, почти не тратит ленту.
export function cutMarkRows(n = 2) {
  const row = new Array(PRINT_WIDTH).fill(1);
  return Array.from({ length: n }, () => row.slice());
}

function encodeRunLengthRepetition(n, val) {
  const res = [];
  while (n > 0x7f) { res.push(0x7f | (val << 7)); n -= 0x7f; }
  if (n > 0) res.push((val << 7) | n);
  return res;
}
function runLengthEncode(row) {
  const res = [];
  let count = 0, lastVal = -1;
  for (const val of row) {
    if (val === lastVal) count += 1;
    else {
      if (count > 0) res.push(...encodeRunLengthRepetition(count, lastVal));
      count = 1;
    }
    lastVal = val;
  }
  if (count > 0) res.push(...encodeRunLengthRepetition(count, lastVal));
  return res;
}
function byteEncode(row) {
  const res = [];
  for (let s = 0; s < row.length; s += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      if (s + b < row.length && row[s + b]) byte |= 1 << b; // LSB = левый пиксель
    }
    res.push(byte);
  }
  return res;
}
function cmdPrintRow(row) {
  let enc = runLengthEncode(row);
  let op = 0xbf;
  if (enc.length > PRINT_WIDTH / 8) { enc = byteEncode(row); op = 0xa2; }
  const a = [0x51,0x78,op,0x00,enc.length,0x00, ...enc, 0x00,0xff];
  a[a.length - 2] = chkSum(a, 6, enc.length);
  return a;
}

// Полный поток байтов для одной копии наклейки.
// rows: массив строк (каждая — массив 0/1 длиной 384), 1 = чёрный.
// feedAfter — протяжка в строках (линиях растра) после этой копии.
export function buildPrintJob(rows, energy, feedAfter, isLast) {
  const out = [];
  out.push(...CMD_SET_QUALITY_200_DPI);
  out.push(...cmdSetEnergy(energy));
  out.push(...cmdApplyEnergy());
  out.push(...CMD_LATTICE_START);
  for (const r of rows) out.push(...cmdPrintRow(r));
  out.push(...cmdFeedPaper(Math.max(1, Math.min(255, feedAfter))));
  out.push(...CMD_LATTICE_END);
  if (isLast) out.push(...CMD_GET_STATUS);
  return new Uint8Array(out);
}

// Серия наклеек одним заданием: копии идут вплотную (feed=1 между ними),
// пустое поле (финальная протяжка) оплачивается один раз.
// Паттерн как в v14 (buildPrintJob на каждую копию): преамбула повторяется
// на каждой копии, между копиями лента не гонится.
// labels: массив { rows: [...], copies: N } — каждая наклейка со своими копиями.
export function buildBatchJob(labels, energy, finalFeed) {
  const total = labels.reduce((s, l) => s + l.copies, 0);
  let printed = 0;
  const parts = [];
  for (const label of labels) {
    for (let c = 0; c < label.copies; c++) {
      printed++;
      const isLast = printed === total;
      parts.push(buildPrintJob(label.rows, energy, isLast ? finalFeed : 1, isLast));
    }
  }
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
