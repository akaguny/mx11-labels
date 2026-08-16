// ===== mx-actions: подключение, печать (одиночная и серия), протяжка, PNG, статусы =====
import { t } from '../core/i18n.js';
import { renderLabel, canvasToRows, composeName, DEAD_MM } from '../core/label.js';
import { buildPrintJob, cutMarkRows, PRINT_WIDTH, PX_PER_MM } from '../core/protocol.js';
import { clamp, MAX_BATCH, Base, defineEl } from './util.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class MxActions extends Base {
  constructor() {
    super();
    this._settings = {};
    this._queue = [];
    this._filament = { brand: '', type: '', color: '', note: '' };
    this._printer = null;
    this._statusText = '';
    this._busy = false;
    this._statusBound = false;
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();
    this._bindLang();
  }
  disconnectedCallback() {
    if (this._onLang) document.removeEventListener('mx:lang', this._onLang);
  }

  _bindLang() {
    this._onLang = () => this.refresh();
    document.addEventListener('mx:lang', this._onLang);
  }

  get settings() { return this._settings; }
  set settings(v) { this._settings = { ...(this._settings), ...(v || {}) }; if (this.shadowRoot) this._syncDisabled(); }
  get queue() { return this._queue; }
  set queue(v) { this._queue = Array.isArray(v) ? v : []; }
  get filament() { return this._filament; }
  set filament(v) { this._filament = { brand: '', type: '', color: '', note: '', ...(v || {}) }; }
  get printer() { return this._printer; }
  set printer(p) {
    this._printer = p;
    if (p && !this._statusBound) {
      this._statusBound = true;
      p.onStatus((key) => {
        const map = { no_paper: t('noPaper'), overheat: t('overheat'), low_battery: t('lowBattery') };
        this._setStatus(map[key] || key);
      });
      p.onDisconnected(() => {
        this._setStatus(t('printerDisconnected'), true);
        this._syncDisabled();
        this._emitPrinterState();
      });
    }
  }

  refresh() { if (this.shadowRoot) this.render(); }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        .row { display:flex; flex-wrap:wrap; gap:8px; }
        button { padding:9px 12px; border:1px solid var(--mx-border,#e5e7eb); background:#fff;
                 border-radius:9px; cursor:pointer; font:inherit; color:var(--mx-text,#111827); flex:1 1 auto; }
        button:disabled { opacity:.45; cursor:default; }
        .primary { background:var(--mx-accent,#16a34a); border-color:var(--mx-accent,#16a34a); color:#fff; }
        .print { background:var(--mx-print,#1d4ed8); border-color:var(--mx-print,#1d4ed8); color:#fff; }
        .find { background:none; border:none; color:var(--mx-accent,#16a34a); text-decoration:underline;
                padding:6px 0 0; text-align:left; flex:none; font-size:12px; }
        .status { min-height:18px; margin-top:10px; font-size:13px; color:var(--mx-text,#111827); }
        .status.warn { color:#b45309; }
        progress { width:100%; margin-top:6px; accent-color:var(--mx-print,#1d4ed8); }
      </style>
      <div class="row">
        <button class="connect primary">${t('connect')}</button>
        <button class="print">${t('print')}</button>
        <button class="feed">${t('feed')}</button>
        <button class="png">${t('downloadPng')}</button>
      </div>
      <button class="find">${t('showAllDevices')}</button>
      <div class="status"></div>
      <progress value="0" max="100"></progress>
    `;
    this._connectBtn = this.shadowRoot.querySelector('.connect');
    this._printBtn = this.shadowRoot.querySelector('.print');
    this._feedBtn = this.shadowRoot.querySelector('.feed');
    this._pngBtn = this.shadowRoot.querySelector('.png');
    this._findBtn = this.shadowRoot.querySelector('.find');
    this._statusEl = this.shadowRoot.querySelector('.status');
    this._progress = this.shadowRoot.querySelector('progress');
    this._connectBtn.addEventListener('click', () => this.connect(false));
    this._findBtn.addEventListener('click', () => this.connect(true));
    this._printBtn.addEventListener('click', () => this.doPrint());
    this._feedBtn.addEventListener('click', () => this.feed());
    this._pngBtn.addEventListener('click', () => this.downloadPng());
    if (this._statusText) this._setStatus(this._statusText);
    this._syncDisabled();
  }

  _setStatus(text, warn) {
    this._statusText = text || '';
    if (this._statusEl) {
      this._statusEl.textContent = text || '';
      this._statusEl.classList.toggle('warn', !!warn);
    }
  }

  _log(msg) { if (this._printer && typeof this._printer.log === 'function') this._printer.log(msg); }

  _setBusy(b) {
    this._busy = b;
    if (this._progress && b) this._progress.value = 0;
    this._syncDisabled();
  }

  _syncDisabled() {
    if (!this._connectBtn) return;
    const conn = !!(this._printer && this._printer.isConnected);
    this._printBtn.disabled = !conn || this._busy;
    this._feedBtn.disabled = !conn || this._busy;
    this._pngBtn.disabled = this._busy;
    this._connectBtn.disabled = this._busy;
    this._findBtn.disabled = this._busy;
  }

  _emitPrinterState() {
    if (typeof this.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      this.dispatchEvent(new CustomEvent('mx:printerState', {
        detail: { connected: !!(this._printer && this._printer.isConnected),
                  name: this._printer && this._printer.device ? this._printer.device.name : '' },
        bubbles: true, composed: true,
      }));
    }
  }

  async connect(showAll = false) {
    if (!this._printer) return;
    this._setStatus(t('selectPrinter'));
    this._setBusy(true);
    try {
      this._log(`requestDevice showAll=${showAll}`);
      await this._printer.requestDevice(showAll);
      this._setStatus(t('connecting'));
      await this._printer.connect();
      const name = (this._printer.device && this._printer.device.name) || '?';
      this._setStatus(t('connected', name));
      this._log(`Подключено: ${name}`);
      this._emitPrinterState();
    } catch (err) {
      this._setStatus(t('printError') + ((err && err.message) || err), true);
    } finally {
      this._setBusy(false);
    }
  }

  async doPrint() {
    if (!this._printer || !this._printer.isConnected) { this._setStatus(t('printerDisconnected'), true); return; }
    const s = this._settings || {};
    const energy = clamp(+s.energy || 100, 30, 100);
    const copies = clamp(+s.copies || 1, 1, 10);
    const finalFeed = Math.max(1, Math.round((+s.tear || 0) * PX_PER_MM));

    // --- Серия: наклейки печатаются отдельными заданиями; очередь делится на пачки по MAX_BATCH с отрывом между ними ---
    if (this._queue && this._queue.length) {
      const chunks = [];
      for (let i = 0; i < this._queue.length; i += MAX_BATCH) chunks.push(this._queue.slice(i, i + MAX_BATCH));
      const labels = this._queue.map(item => ({ rows: this._rowsFor(item, s), copies }));
      const total = labels.reduce((a, l) => a + l.copies, 0);
      // Прогресс по времени: принтер печатает ~40 строк/с (5 мм/с при плотности
      // 100%), отправка идёт в том же темпе — бар отражает реальное продвижение
      // ленты, а не скорость BLE-записи (раньше он обгонял печать на ~40%).
      const ROWS_PER_SEC = 40;
      const totalRows = labels.reduce((s, l) => s + l.rows.length * l.copies, 0)
        + (total > 0 ? (total - 1) * 2 : 0)          // линии отреза между наклейками
        + Math.max(1, Math.round((+s.tear || 0) * PX_PER_MM)); // финальная протяжка
      const printMs = Math.max(1000, Math.round(totalRows / ROWS_PER_SEC * 1000));
      const startedAt = Date.now();
      const progTimer = setInterval(() => {
        if (this._progress) this._progress.value = Math.min(99.5, Math.round((Date.now() - startedAt) / printMs * 1000) / 10);
      }, 500);
      let printed = 0;
      let ok = false;
      this._setBusy(true);
      this._log(`Печать серии: ${this._queue.length} наклеек × ${copies} копий = ${total} шт (пачки по ${MAX_BATCH})`);
      try {
        for (let ci = 0; ci < chunks.length; ci++) {
          const chunk = chunks[ci];
          const isLastChunk = ci === chunks.length - 1;
          const chunkNote = chunks.length > 1 ? t('batchChunk', ci + 1, chunks.length) : '';
          const chunkTotal = chunk.reduce((a, item) => a + labels[this._queue.indexOf(item)].copies, 0);
          let chunkPrinted = 0;
          for (const item of chunk) {
            const label = labels[this._queue.indexOf(item)];
            for (let c = 0; c < label.copies; c++) {
              printed++;
              chunkPrinted++;
              const isChunkLast = chunkPrinted === chunkTotal;
              // Между наклейками (кроме самой последней в серии) печатаем тонкую
              // линию отреза — иначе вплотную напечатанные рамки сливаются в одну.
              const rows = printed === total ? label.rows : [...label.rows, ...cutMarkRows()];
              const bytes = buildPrintJob(rows, energy, isChunkLast ? finalFeed : 1, isChunkLast);
              this._setStatus((chunkNote ? chunkNote + ' · ' : '') + t('printingN', printed, total));
              await this._printer.print(bytes);
              // Пауза между наклейками: принтер должен допечатать предыдущую
              // и освободить буфер, иначе преамбула следующего задания теряется
              // (при темпе записи = печати хвост допечатывается за <1 с, 2 с — запас).
              if (!isChunkLast) await sleep(2000);
            }
          }
          if (!isLastChunk) await sleep(1500);      // между пачками: ленту можно оторвать, принтеру дать выдохнуть
        }
        // даём принтеру допечатать хвост (буфер + финальная протяжка)
        const remain = printMs + 1500 - (Date.now() - startedAt);
        if (remain > 0) await sleep(remain);
        if (this._progress) this._progress.value = 100;
        this._setStatus(t('doneTear'));
        ok = true;
      } catch (err) {
        this._setStatus(t('printError') + ((err && err.message) || err), true);
      } finally {
        clearInterval(progTimer);
        this._setBusy(false);
      }
      if (ok) {
        for (const item of this._queue) {
          if (typeof this.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
            this.dispatchEvent(new CustomEvent('mx:history', {
              detail: { name: composeName(item), copies,
                        item: { brand: item.brand || '', type: item.type || '', color: item.color || '', note: item.note || '' } },
              bubbles: true, composed: true }));
          }
        }
      }
      return;
    }

    const name = composeName(this._filament);
    if (!name) { this._setStatus(t('fillName'), true); return; }
    const rows = this._rowsFor(this._filament, s);
    const bytes = buildPrintJob(rows, energy, finalFeed, true);
    this._log(`Печать одиночной: ${name} × ${copies}, ${bytes.length} байт`);
    const ok = await this._send(bytes, copies, rows.length);
    if (ok && typeof this.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      const f = this._filament || {};
      this.dispatchEvent(new CustomEvent('mx:history', {
        detail: { name, copies,
                  item: { brand: f.brand || '', type: f.type || '', color: f.color || '', note: f.note || '' } },
        bubbles: true, composed: true }));
    }
  }

  async printItem(item) {
    if (!this._printer || !this._printer.isConnected) { this._setStatus(t('printerDisconnected'), true); return; }
    const s = this._settings || {};
    const copies = clamp(+s.copies || 1, 1, 10);
    const rows = this._rowsFor(item, s);
    const bytes = buildPrintJob(rows, clamp(+s.energy || 100, 30, 100),
      Math.max(1, Math.round((+s.tear || 0) * PX_PER_MM)), true);
    this._log(`Печать из каталога: ${composeName(item)} × ${copies}, ${bytes.length} байт`);
    const ok = await this._send(bytes, copies, rows.length);
    if (ok && typeof this.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      this.dispatchEvent(new CustomEvent('mx:history', {
        detail: { name: composeName(item), copies,
                  item: { brand: item.brand || '', type: item.type || '', color: item.color || '', note: item.note || '' } },
        bubbles: true, composed: true }));
    }
  }

  _rowsFor(item, s) {
    const c = document.createElement('canvas');
    renderLabel(c, {
      brand: item.brand || '', type: item.type || '', color: item.color || '', note: item.note || '',
      wMm: s.wmm, hMm: s.hmm, orient: s.orient, offMm: s.offmm, border: s.border,
    });
    return canvasToRows(c, s.orient, s.offmm);
  }

  _send(bytes, total, rowsPerCopy) {
    this._setStatus(t('printingN', 1, total));
    this._setBusy(true);
    if (this._progress) this._progress.value = 0;
    // Прогресс по времени печати (~40 строк/с при плотности 100%), как в серии.
    const ROWS_PER_SEC = 40;
    const printMs = Math.max(1000, Math.round((rowsPerCopy || 1) * Math.max(1, total || 1) / ROWS_PER_SEC * 1000));
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (this._progress) this._progress.value = Math.min(99.5, Math.round((Date.now() - startedAt) / printMs * 1000) / 10);
    }, 500);
    return this._printer.print(bytes)
      .then(async () => {
        // даём принтеру допечатать хвост (буфер + финальная протяжка)
        const remain = printMs + 1000 - (Date.now() - startedAt);
        if (remain > 0) await sleep(remain);
        if (this._progress) this._progress.value = 100;
        this._setStatus(t('doneTear'));
        return true;
      })
      .catch(err => { this._setStatus(t('printError') + ((err && err.message) || err), true); return false; })
      .finally(() => { clearInterval(timer); this._setBusy(false); });
  }

  async feed() {
    if (!this._printer || !this._printer.isConnected) { this._setStatus(t('printerDisconnected'), true); return; }
    const lines = Math.max(1, Math.round((+this._settings.tear || 0) * PX_PER_MM));
    this._log(`Протяжка ${lines} линий`);
    await this._printer.feed(lines);
    this._setStatus(t('feedDone'));
  }

  downloadPng() {
    const s = this._settings || {};
    const q = this._queue || [];
    if (q.length) {
      // Серия: один длинный PNG «как лента» — из фактического растра печати:
      // наклейки повёрнуты как на ленте (вдоль — на 90°), между ними линия
      // отреза, по краям мёртвые поля 4.5 мм. Раньше клеились неповёрнутые
      // canvas'ы друг под друга — получался «столбик», а не лента.
      const items = [];
      const copies = clamp(+s.copies || 1, 1, 10);
      for (const item of q) for (let c = 0; c < copies; c++) items.push(item);
      const rowsAll = [];
      items.forEach((it, i) => {
        rowsAll.push(...this._rowsFor(it, s));
        if (i < items.length - 1) rowsAll.push(...cutMarkRows());
      });
      const dead = Math.round(DEAD_MM * PX_PER_MM);          // 36 px = 4.5 мм
      const W = PRINT_WIDTH + 2 * dead;                       // полная ширина ленты 57 мм
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = rowsAll.length;
      const ctx = tmp.getContext('2d');
      const img = ctx.createImageData(W, rowsAll.length);
      img.data.fill(255);                                     // белый фон (r,g,b,a)
      rowsAll.forEach((row, y) => {
        for (let x = 0; x < PRINT_WIDTH; x++) {
          if (row[x]) {
            const p = (y * W + x + dead) * 4;
            img.data[p] = 0; img.data[p + 1] = 0; img.data[p + 2] = 0;
          }
        }
      });
      ctx.putImageData(img, 0, 0);
      const name = composeName(q[0]).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '_') || 'series';
      const a = document.createElement('a');
      a.download = name + '_series.png';
      a.href = tmp.toDataURL('image/png');
      a.click();
      this._log(`PNG серии (${items.length} наклеек, лента ${(W / PX_PER_MM).toFixed(1)}×${(rowsAll.length / PX_PER_MM).toFixed(1)} мм) скачан`);
      return;
    }
    const f = this._filament || {};
    const name = composeName(f);
    if (!name) { this._setStatus(t('fillName'), true); return; }
    const tmp = document.createElement('canvas');
    renderLabel(tmp, {
      brand: f.brand, type: f.type, color: f.color, note: f.note,
      wMm: s.wmm, hMm: s.hmm, orient: s.orient, offMm: s.offmm, border: s.border,
    });
    const a = document.createElement('a');
    a.download = name.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '_') + '.png';
    a.href = tmp.toDataURL('image/png');
    a.click();
    this._log('PNG скачан');
  }
}
defineEl('mx-actions', MxActions);
