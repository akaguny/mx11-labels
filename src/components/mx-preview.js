// ===== mx-preview: предпросмотр (canvas в натуральную величину), схема ленты, миниатюры очереди =====
import { t } from '../core/i18n.js';
import { renderLabel, composeName } from '../core/label.js';
import { PRINT_WIDTH, PX_PER_MM } from '../core/protocol.js';
import { esc, emit, clamp, Base, defineEl } from './util.js';

const TAPE = 57, DEAD = 4.5;
const r1 = n => Math.round(n * 10) / 10;

export class MxPreview extends Base {
  constructor() {
    super();
    this._filament = { brand: '', type: '', color: '', note: '' };
    this._settings = {};
    this._queue = [];
    this._editIndex = null;
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();
    this._bindLang();
  }
  disconnectedCallback() { if (this._onLang) document.removeEventListener('mx:lang', this._onLang); }

  _bindLang() {
    this._onLang = () => this.refresh();
    document.addEventListener('mx:lang', this._onLang);
  }

  get filament() { return this._filament; }
  set filament(v) { this._filament = { brand: '', type: '', color: '', note: '', ...(v || {}) }; if (this.shadowRoot) this.rerender(); }
  get settings() { return this._settings; }
  set settings(v) { this._settings = { ...(this._settings), ...(v || {}) }; if (this.shadowRoot) this.rerender(); }
  get queue() { return this._queue; }
  set queue(v) { this._queue = Array.isArray(v) ? v : []; if (this.shadowRoot) this.rerender(); }
  set editIndex(v) { this._editIndex = (v == null) ? null : v; if (this.shadowRoot) this.rerender(); }
  get editIndex() { return this._editIndex; }

  refresh() { if (this.shadowRoot) this.render(); }

  render() {
    const s = this._settings || {};
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        h2 { margin:0 0 10px; font-size:15px; }
        .main { display:block; max-width:100%; border:1px solid var(--mx-border,#e5e7eb);
                border-radius:6px; image-rendering:pixelated; }
        .dims { font-size:12px; color:var(--mx-muted,#6b7280); margin-top:6px; }
        .tape { margin:12px 0; }
        .bar { display:flex; height:16px; border-radius:4px; overflow:hidden; border:1px solid var(--mx-border,#e5e7eb); }
        .bar .b { height:100%; }
        .bar .dead { background:#d1d5db; }
        .bar .empty { background:#f3f4f6; }
        .bar .label { background:var(--mx-accent,#16a34a); }
        .tape-note { font-size:11px; color:var(--mx-muted,#6b7280); margin-top:4px; }
        .big { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--mx-text,#111827);
               cursor:pointer; margin-top:8px; }
        .thumbs { display:flex; gap:8px; overflow-x:auto; padding:8px 0 4px; margin-top:6px; }
        .thumb { flex:none; width:96px; height:36px; border:2px solid var(--mx-border,#e5e7eb);
                 border-radius:6px; padding:0; cursor:pointer; background:#fff; overflow:hidden; }
        .thumb.active { border-color:var(--mx-accent,#16a34a); }
        .thumb canvas { display:block; }
        .emptyq { font-size:12px; color:var(--mx-muted,#6b7280); margin:6px 0 0; }
      </style>
      <h2>🏷️ ${t('preview')}</h2>
      <canvas class="main" width="1" height="1"></canvas>
      <div class="dims"></div>
      <div class="tape">
        <div class="bar"></div>
        <div class="tape-note"></div>
      </div>
      <label class="big"><input type="checkbox" class="bigchk"> ${t('bigPreview')}</label>
      <div class="thumbs"></div>
      <p class="emptyq" hidden></p>
    `;
    this._canvas = this.shadowRoot.querySelector('.main');
    this._dimsEl = this.shadowRoot.querySelector('.dims');
    this._barEl = this.shadowRoot.querySelector('.bar');
    this._tapeNoteEl = this.shadowRoot.querySelector('.tape-note');
    this._bigChk = this.shadowRoot.querySelector('.bigchk');
    this._thumbsEl = this.shadowRoot.querySelector('.thumbs');
    this._emptyQ = this.shadowRoot.querySelector('.emptyq');
    this._bigChk.checked = !!this._settings.bigPreview;
    this._bigChk.addEventListener('change', () => {
      emit(this, 'mx:settings', { settings: { ...this._settings, bigPreview: this._bigChk.checked } });
    });
    this.rerender();
  }

  rerender() {
    if (!this.shadowRoot) return;
    const s = this._settings || {};
    if (this._bigChk) this._bigChk.checked = !!s.bigPreview;
    const f = this._filament || {};
    const screenCal = clamp((+s.cal || 100) / 100, 0.5, 2);
    const opts = {
      brand: f.brand, type: f.type, color: f.color, note: f.note,
      wMm: s.wmm, hMm: s.hmm, orient: s.orient, offMm: s.offmm, border: s.border,
    };
    const info = renderLabel(this._canvas, opts);
    this._dimsEl.textContent = t('dims', info.wMm, info.hMm, info.W, info.H, !!s.bigPreview, info.along);
    if (s.bigPreview) {
      this._canvas.style.width = '320px';
      this._canvas.style.height = 'auto';
    } else {
      this._canvas.style.width = (info.wMm * screenCal) + 'mm';
      this._canvas.style.height = (info.hMm * screenCal) + 'mm';
    }
    this._renderTape(info, screenCal);
    this._renderThumbs(opts, screenCal);
  }

  _renderTape(info) {
    const usedMm = info.usedDots / PX_PER_MM;
    const offMm = info.off / PX_PER_MM;
    const live = PRINT_WIDTH / PX_PER_MM;
    const rest = Math.max(0, live - offMm - usedMm);
    const segs = [DEAD, offMm, usedMm, rest, DEAD];
    const cls = ['dead', 'empty', 'label', 'empty', 'dead'];
    this._barEl.innerHTML = segs.map((mm, i) =>
      `<div class="b ${cls[i]}" style="width:${Math.max(0, mm / TAPE * 100).toFixed(2)}%"></div>`).join('');
    this._tapeNoteEl.textContent = t('tapeNote', TAPE, DEAD, r1(offMm), r1(usedMm), r1(rest));
  }

  _renderThumbs(opts, screenCal) {
    const q = this._queue || [];
    this._thumbsEl.innerHTML = '';
    this._emptyQ.hidden = q.length > 0;
    this._emptyQ.textContent = t('batchEmpty');
    for (let i = 0; i < q.length; i++) {
      const item = q[i];
      const wrap = document.createElement('button');
      wrap.className = 'thumb' + (i === this._editIndex ? ' active' : '');
      wrap.title = composeName(item);
      const tmp = document.createElement('canvas');
      renderLabel(tmp, { ...opts, brand: item.brand, type: item.type, color: item.color, note: item.note });
      const small = document.createElement('canvas');
      small.width = 96; small.height = 36;
      const ctx = small.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 96, 36);
      const scale = Math.min(96 / Math.max(1, tmp.width), 36 / Math.max(1, tmp.height));
      const dw = tmp.width * scale, dh = tmp.height * scale;
      ctx.drawImage(tmp, (96 - dw) / 2, (36 - dh) / 2, dw, dh);
      wrap.appendChild(small);
      wrap.addEventListener('click', () => emit(this, 'mx:editIndex', { index: i }));
      this._thumbsEl.appendChild(wrap);
    }
  }
}
defineEl('mx-preview', MxPreview);
