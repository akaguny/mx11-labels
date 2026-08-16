// ===== mx-batch: пакетная печать — разбор строк, очередь карточек =====
import { t } from '../core/i18n.js';
import { composeName } from '../core/label.js';
import { esc, emit, MAX_BATCH, Base, defineEl } from './util.js';

export class MxBatch extends Base {
  constructor() {
    super();
    this._queue = [];
    this._taValue = '';
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

  get queue() { return this._queue; }
  set queue(v) {
    this._queue = Array.isArray(v) ? v : [];
    if (this.shadowRoot) { this.render(); this._renderCards(); }
  }
  set editIndex(v) {
    this._editIndex = (v == null) ? null : v;
    if (this.shadowRoot) this._renderCards();
  }
  get editIndex() { return this._editIndex; }

  refresh() { if (this.shadowRoot) this.render(); }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        h2 { margin:0 0 8px; font-size:15px; }
        .hint, .series, .count, .batch-note { font-size:12px; color:var(--mx-muted,#6b7280); margin:4px 0; }
        textarea { width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid var(--mx-border,#e5e7eb);
                   border-radius:8px; font:inherit; color:var(--mx-text,#111827); resize:vertical; }
        textarea:focus { outline:2px solid var(--mx-accent,#16a34a); outline-offset:-1px; }
        .row { display:flex; gap:8px; margin:8px 0; }
        button { padding:8px 12px; border:1px solid var(--mx-border,#e5e7eb); background:#fff;
                 border-radius:8px; cursor:pointer; font:inherit; color:var(--mx-text,#111827); }
        button.primary { background:var(--mx-accent,#16a34a); border-color:var(--mx-accent,#16a34a); color:#fff; }
        button:hover { opacity:.9; }
        .cards { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
        .card { display:flex; align-items:center; justify-content:space-between; gap:8px;
                border:1px solid var(--mx-border,#e5e7eb); border-radius:8px; padding:6px 8px; font-size:13px; }
        .card.active { border-color:var(--mx-accent,#16a34a); background:rgba(22,163,74,.06); }
        .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .btns { display:flex; gap:6px; flex:none; }
        .btns button { padding:4px 8px; font-size:12px; }
        .empty { font-size:12px; color:var(--mx-muted,#6b7280); margin:4px 0; }
      </style>
      <h2>📦 ${t('batch')}</h2>
      <p class="hint">${t('batchHint')}</p>
      <textarea class="ta" rows="4" placeholder="${esc(t('batchPlaceholder'))}"></textarea>
      <div class="row">
        <button class="parse primary">${t('batchParse')}</button>
        <button class="clear">${t('batchClear')}</button>
      </div>
      <p class="count"></p>
      <p class="batch-note"></p>
      <p class="series">${t('batchSeries')}</p>
      <div class="cards"></div>
    `;
    this._ta = this.shadowRoot.querySelector('.ta');
    this._ta.value = this._taValue || '';
    this._ta.addEventListener('input', e => { this._taValue = e.target.value; });
    this.shadowRoot.querySelector('.parse').addEventListener('click', () => this._parse());
    this.shadowRoot.querySelector('.clear').addEventListener('click', () => this._clear());
    this._countEl = this.shadowRoot.querySelector('.count');
    this._noteEl = this.shadowRoot.querySelector('.batch-note');
    this._cardsEl = this.shadowRoot.querySelector('.cards');
    this._renderCards();
  }

  _parse() {
    const items = [];
    for (const raw of (this._taValue || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(',').map(x => x.trim());
      if (parts.every(p => !p)) continue;
      items.push({ brand: parts[0] || '', type: parts[1] || '', color: parts[2] || '', note: '' });
    }
    this._queue = items;
    this._editIndex = null;
    this._renderCards();
    emit(this, 'mx:queue', { queue: items, autoload: items[0] ? { ...items[0] } : null });
  }

  _clear() {
    this._taValue = '';
    if (this._ta) this._ta.value = '';
    this._queue = [];
    this._editIndex = null;
    this._renderCards();
    emit(this, 'mx:queue', { queue: [], autoload: null });
  }

  _renderCards() {
    const q = this._queue || [];
    if (!this._countEl) return;
    this._countEl.textContent = t('batchCount', q.length);
    if (this._noteEl) {
      this._noteEl.textContent = q.length > MAX_BATCH ? t('batchLimitNote', MAX_BATCH) : '';
    }
    if (!q.length) {
      this._cardsEl.innerHTML = `<p class="empty">${t('batchEmpty')}</p>`;
      return;
    }
    this._cardsEl.innerHTML = q.map((item, i) => `
      <div class="card${i === this._editIndex ? ' active' : ''}">
        <div class="name">${esc(composeName(item))}</div>
        <div class="btns">
          <button class="edit" data-i="${i}">${t('batchEdit')}</button>
          <button class="rm" data-i="${i}">${t('batchRemove')}</button>
        </div>
      </div>`).join('');
    this._cardsEl.querySelectorAll('.edit').forEach(b => b.addEventListener('click', () => {
      emit(this, 'mx:editIndex', { index: +b.dataset.i });
    }));
    this._cardsEl.querySelectorAll('.rm').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      this._queue.splice(i, 1);
      if (this._editIndex === i) this._editIndex = null;
      else if (this._editIndex != null && i < this._editIndex) this._editIndex--;
      this._renderCards();
      emit(this, 'mx:queue', { queue: this._queue.slice(), autoload: null });
    }));
  }
}
defineEl('mx-batch', MxBatch);
