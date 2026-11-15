#!/usr/bin/env node
// Проверка режима «QR-ключ» без браузера и зависимостей.
//   node tools/qr-fit.mjs                    — самотест (exit 0 только если всё прошло)
//   node tools/qr-fit.mjs "<текст>" [sideMm] — JSON подбора для одной строки
//                                              (exit 0 — помещается, 1 — нет); текст не печатается
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fitQr, qrKeyGeometry, effectiveSide, normCaption, layoutSideCaption, QR_MAX_CHARS, QR_MAX_CAPTION,
         QR_STRIP_DOTS, QR_GAP_DOTS, QR_MAX_SIDE_CAPTION_MM, QR_PAD } from '../src/core/qrkey.js';
import { buildPrintJob, CMD_GET_STATUS, PRINT_WIDTH } from '../src/core/protocol.js';

const summary = (text, sideMm) => {
  const f = fitQr(text, sideMm);
  return {
    chars: f.chars, ec: f.ec, modules: f.n, modulePx: f.modulePx, sideMm: f.sideMm,
    fits: f.ok, warn: f.warn, ...(f.reason ? { reason: f.reason } : {}),
    need3pxMm: f.needMm,
  };
};

// ---------- режим одной строки ----------
if (process.argv.length > 2) {
  const [, , text, side] = process.argv;
  const r = summary(text, side === undefined ? 40 : side);
  console.log(JSON.stringify(r));
  process.exit(r.fits ? 0 : 1);
}

// ---------- самотест ----------
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};

// Детерминированный «ключ»: base32-подобный алфавит, чтобы данные были несжимаемыми.
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const rnd = (len, seed = 1) => {
  let x = seed, s = '';
  for (let i = 0; i < len; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += ALPHA[x % 32]; }
  return s;
};
const CYR = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const cyr = len => Array.from({ length: len }, (_, i) => CYR[(i * 7 + 3) % CYR.length]).join('');
const words = 'abandon ability able about above absent absorb abstract absurd abuse access accident '.repeat(2).trim();

console.log('== подбор QR (fitQr) ==');
const cases = [
  ['30 симв.',            rnd(30),                         40, { fits: true, minPx: 3, ec: 'H' }],
  ['200 симв.',           rnd(200),                        40, { fits: true, minPx: 3 }],
  ['600 симв.',           rnd(600),                        40, { fits: true, minPx: 3, warn: false }],
  ['600 симв., 48 мм',    rnd(600),                        48, { fits: true, minPx: 3, warn: false }],
  ['1500 симв., 48 мм',   rnd(1500),                       48, { fits: true, warn: true }],
  ['кириллица 120',       cyr(120),                        48, { fits: true }],
  ['переводы строк',      'line1\nline2\r\nline3\n' + rnd(60), 40, { fits: true, minPx: 3 }],
  ['seed 24 слова',       words,                           40, { fits: true }],
  ['2000 симв., 48 мм',   rnd(2000),                       48, { fits: true, warn: true }],
  ['200 симв., 30 мм',    rnd(200),                        30, { fits: true, minPx: 3 }],
  ['200 симв., 20 мм',    rnd(200),                        20, { fits: true, warn: true }],
  ['600 симв., 20 мм',    rnd(600),                        20, { fits: false, reason: 'needMm' }],
  ['кириллица 1200',      cyr(1200),                       48, { fits: true, warn: true }],
  ['кириллица 1470 (v40)', cyr(1470),                      48, { fits: false, reason: 'tooMuch' }],
  ['кириллица 2000 (overflow)', cyr(2000),                 48, { fits: false, reason: 'tooMuch' }],
  ['пусто',               '',                              40, { fits: false, reason: 'empty' }],
];
for (const [name, text, side, exp] of cases) {
  const r = summary(text, side);
  const f = fitQr(text, side);
  console.log(`${name.padEnd(20)} ${JSON.stringify(r)}`);
  let ok = r.fits === exp.fits;
  if (exp.warn !== undefined) ok = ok && r.warn === exp.warn;
  if (exp.minPx) ok = ok && r.modulePx >= exp.minPx;
  if (exp.ec) ok = ok && r.ec === exp.ec;
  if (exp.reason) ok = ok && r.reason === exp.reason;
  if (r.fits) {
    // геометрия: (n+8) модулей + 2×pad укладываются в сторону, модуль ≥ 2, warn ⇔ модуль 2
    ok = ok && (r.modules + 8) * r.modulePx + 16 <= r.sideMm * 8 && r.modulePx >= 2
            && r.warn === (r.modulePx === 2) && f.version === (r.modules - 17) / 4;
  }
  check(`fit: ${name}`, ok);
}
{
  // Порядок EC: короткая строка → H; строка, не влезающая в H, → более слабый уровень.
  check('ec: короткая строка → H', fitQr(rnd(30), 40).ec === 'H');
  const f = fitQr(rnd(1500), 48);
  check('ec: 1500 симв. → не H', f.ok && f.ec !== 'H', `(ec=${f.ec})`);
  // UTF-8: кириллица занимает 2 байта на символ → QR заметно больше, чем у латиницы той же длины
  const a = fitQr(cyr(120), 48), b = fitQr(rnd(120), 48);
  check('utf-8: кириллица кодируется 2 байтами (QR больше латиницы)', a.n > b.n, `(${a.n} > ${b.n})`);
  // граница: нужна сторона ≥ X мм — сообщение считается по n при модуле 3
  const tight = fitQr(rnd(600), 20);
  check('reason needMm при тесной стороне', !tight.ok && tight.reason === 'needMm' && tight.needMm > 20 && tight.needMm <= 48,
    `(needMm=${tight.needMm})`);
}

console.log('\n== геометрия этикетки с подписью (qrKeyGeometry / layoutSideCaption) ==');
{
  check('константы: полоса 48 точек, зазор 16, макс. сторона с подписью 40 мм',
    QR_STRIP_DOTS === 48 && QR_GAP_DOTS === 16 && QR_MAX_SIDE_CAPTION_MM === 40 && QR_PAD === 8);
  check(`подпись до ${QR_MAX_CAPTION} симв. (=60)`, QR_MAX_CAPTION === 60);
  let geoOk = true, noCapOk = true, effOk = true;
  for (let mm = 20; mm <= 48; mm++) {
    const d = mm * 8;
    const g = qrKeyGeometry(d, true), n = qrKeyGeometry(d, false);
    geoOk = geoOk && g.W === d + 48 + 16 && g.H === d && g.stripDots === 48 && g.qrSideDots === d;
    noCapOk = noCapOk && n.W === d && n.H === d && n.stripDots === 0;
    // вызывающий код ограничивает сторону 40 мм → W ≤ 384 при любом выбранном значении 20..48
    const e = effectiveSide(mm, 'x');
    effOk = effOk && e === Math.min(mm, 40) && qrKeyGeometry(e * 8, true).W <= 384 && effectiveSide(mm, '  \n ') === mm;
  }
  check('с подписью: W = side + 48 + 16, H = side (стороны 20..48)', geoOk);
  check('без подписи: W = H = side', noCapOk);
  check('effectiveSide: min(сторона, 40) при подписи, W ≤ 384; пустая/пробельная подпись — без ограничения', effOk);
  check('на 40 мм с подписью W = 384 ровно', qrKeyGeometry(320, true).W === 384);
  check('normCaption схлопывает пробелы', normCaption('  a \t b\n c ') === 'a b c');
  // fitQr не зависит от подписи: подбор версии/EC/модуля тот же
  const f40 = fitQr(rnd(200), effectiveSide(48, 'cap'));
  check('fitQr с эффективной стороной 40: sideMm = 40, sideDots = 320', f40.ok && f40.sideMm === 40 && f40.sideDots === 320);

  // Подпись без canvas: мок ctx с measureText (ширина ∝ кегль × число символов). Проверяем кегль и границы.
  const mk = () => ({ font: '', measureText(s) { const fs = +/(\d+)px/.exec(this.font)[1]; return { width: s.length * fs * 0.6 }; } });
  const maxLen = 40 * 8 - 2 * QR_PAD;                       // H − 2·PAD для QR 40 мм = 304
  let capOk = true, detail = '';
  for (const len of [1, 5, 20, 30, 40, 50, 60]) {
    const lay = layoutSideCaption(mk(), 'W'.repeat(len), maxLen);
    const inside = lay.width <= maxLen && lay.fs <= QR_STRIP_DOTS - 4 && lay.fs >= 10 && lay.fs <= 16;
    const wantEll = len * 10 * 0.6 > maxLen;                // не влезает даже на 10 px
    const gotEll = lay.text.endsWith('…');
    const maxFs = lay.fs === 16 || (lay.fs < 16 && len * (lay.fs + 1) * 0.6 > maxLen);   // кегль максимальный
    if (!(inside && gotEll === wantEll && maxFs)) { capOk = false; detail += ` len=${len}:fs=${lay.fs},w=${lay.width},ell=${gotEll}`; }
  }
  check('подпись: кегль 16→10, влезает по длине H−2·PAD и в полосу, «…» только если не влезла на 10 px', capOk, detail);
  const short = layoutSideCaption(mk(), 'abc', maxLen), long = layoutSideCaption(mk(), 'W'.repeat(60), maxLen);
  check('подпись: короткая — 16 px без «…»; 60 символов при 10 px — с «…» в пределах длины',
    short.fs === 16 && short.text === 'abc' && long.fs === 10 && long.text.endsWith('…') && long.width <= maxLen);
}

console.log('\n== buildPrintJob: структура кадров ==');
const crc8 = bytes => {                          // независимая реализация CRC-8 (poly 0x07)
  let c = 0;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c & 0x80) ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; }
  return c;
};
const parseFrames = buf => {
  const frames = [];
  let i = 0;
  while (i < buf.length) {
    if (buf[i] !== 0x51 || buf[i + 1] !== 0x78 || buf[i + 3] !== 0x00) return { frames, err: `bad header @${i}` };
    const len = buf[i + 4] | (buf[i + 5] << 8);
    const end = i + 6 + len + 2;
    if (end > buf.length) return { frames, err: `truncated frame @${i}` };
    frames.push({ at: i, cmd: buf[i + 2], len, payload: buf.slice(i + 6, i + 6 + len),
                  crc: buf[i + 6 + len], tail: buf[i + 6 + len + 1], size: end - i });
    i = end;
  }
  return { frames, err: null };
};
const bits = f => Array.from({ length: PRINT_WIDTH }, (_, x) => f(x));
const rows = [
  bits(() => 0),                          // белая — RLE (bf)
  bits(x => x & 1),                       // «гребёнка» — RLE длиннее 48 байт → побайтово (a2)
  bits(() => 1),                          // чёрная — RLE
  bits(x => (x >> 1) & 1),                // период 4 — побайтово
  bits(x => (x < 100 ? 1 : 0)),           // один переход — RLE
];
check('rows: 5 строк по 384 бита', rows.length === 5 && rows.every(r => r.length === 384));

for (const isLast of [true, false]) {
  const buf = buildPrintJob(rows, 100, 56, isLast);
  const { frames, err } = parseFrames(buf);
  const tag = `isLast=${isLast}`;
  check(`${tag}: кадры разбираются без остатка`, !err && frames.reduce((s, f) => s + f.size, 0) === buf.length, err || `(${frames.length} кадров, ${buf.length} байт)`);
  check(`${tag}: у каждого кадра хвост 0xff`, frames.every(f => f.tail === 0xff));
  const badCrc = frames.filter(f => crc8(f.payload) !== f.crc);
  check(`${tag}: CRC-8 верна в каждом кадре`, badCrc.length === 0,
    badCrc.length ? `(плохие кадры cmd=${badCrc.map(f => '0x' + f.cmd.toString(16))})` : `(${frames.length}/${frames.length})`);
  const rowFrames = frames.filter(f => f.cmd === 0xbf || f.cmd === 0xa2);
  check(`${tag}: 5 строковых кадров`, rowFrames.length === 5);
  check(`${tag}: путь RLE/побайтовый чередуется bf,a2,bf,a2,bf`,
    rowFrames.map(f => f.cmd.toString(16)).join(',') === 'bf,a2,bf,a2,bf', `(${rowFrames.map(f => f.cmd.toString(16)).join(',')})`);
  check(`${tag}: побайтовый кадр = 48 байт, RLE ≤ 48`,
    rowFrames.every(f => (f.cmd === 0xa2 ? f.len === 48 : f.len <= 48)));
  const order = frames.map(f => f.cmd.toString(16)).join(' ');
  const want = ['a4', 'af', 'be', 'a6', 'bf', 'a2', 'bf', 'a2', 'bf', 'a1', 'a6', ...(isLast ? ['a3'] : [])].join(' ');
  check(`${tag}: порядок команд`, order === want, order === want ? '' : `\n      got  ${order}\n      want ${want}`);
  const feed = frames.find(f => f.cmd === 0xa1);
  check(`${tag}: протяжка = 56 строк`, feed && feed.payload[0] === 56);
  if (isLast) {
    const tail = Array.from(buf.slice(buf.length - CMD_GET_STATUS.length));
    check('isLast=true: последний кадр = CMD_GET_STATUS', tail.join() === CMD_GET_STATUS.join());
  } else {
    const lastCmd = frames[frames.length - 1].cmd;
    check('isLast=false: CMD_GET_STATUS в конце нет', lastCmd === 0xa6);
  }
}

console.log('\n== приватность: статическая проверка новых модулей режима ==');
const root = new URL('../', import.meta.url);
const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch('], [/XMLHttpRequest/, 'XMLHttpRequest'], [/sendBeacon/, 'sendBeacon'],
  [/https?:\/\//i, 'внешний URL'], [/\blocalStorage\b/, 'localStorage'], [/\bsessionStorage\b/, 'sessionStorage'],
  [/\bindexedDB\b/, 'indexedDB'], [/\bconsole\./, 'console.*'], [/location\.(hash|href|search)|history\.(push|replace)State/, 'URL/hash'],
  [/mx:history/, 'mx:history'], [/WebSocket|EventSource/, 'WebSocket/EventSource'],
];
for (const rel of ['src/core/qrkey.js', 'src/components/mx-qrkey.js']) {
  let src;
  try { src = readFileSync(fileURLToPath(new URL(rel, root)), 'utf8'); }
  catch (e) { check(`privacy: ${rel} читается`, false, e.code); continue; }
  const hits = FORBIDDEN.filter(([re]) => re.test(src)).map(([, n]) => n);
  check(`privacy: ${rel} без сети/хранилищ/логов`, hits.length === 0, hits.length ? `(найдено: ${hits.join(', ')})` : '');
}
check(`лимит данных ${QR_MAX_CHARS} симв. объявлен`, QR_MAX_CHARS === 2000);

console.log(`\n${failed ? 'FAILED' : 'OK'}: ${failed} проверок не прошло`);
process.exit(failed ? 1 : 0);
