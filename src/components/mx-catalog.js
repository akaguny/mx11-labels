// ===== mx-catalog: каталог филаментов + история печати =====
import { t } from '../core/i18n.js';
import { composeName } from '../core/label.js';
import { loadCatalog, removeCatalogItem, loadHistory, clearHistory } from '../core/store.js';
import { esc, emit, Base, defineEl } from './util.js';

const fmtDate = ts => {
  try { return new Date(ts).toLocaleString(); } catch (_) { return ''; }
};

export class MxCatalog extends Base {
  constructor() {
    super();
    this._catalog = [];
    this._history = [];
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.refresh();
    this._bindLang();
  }
  disconnectedCallback() { if (this._onLang) document.removeEventListener('mx:lang', this._onLang); }

  _bindLang() {
    this._onLang = () => this.refresh();
    document.addEventListener('mx:lang', this._onLang);
  }

  refresh() {
    this._catalog = (loadCatalog && loadCatalog()) || [];
    this._history = (loadHistory && loadHistory()) || [];
    if (this.shadowRoot) this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        h2 { margin:14px 0 8px; font-size:15px; }
        h2:first-child { margin-top:0; }
        .item { display:flex; align-items:center; justify-content:space-between; gap:8px;
                padding:6px 8px; border:1px solid var(--mx-border,#e5e7eb); border-radius:8px; margin:6px 0;
                font-size:13px; }
        .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .note { color:var(--mx-muted,#6b7280); font-size:11px; }
        .btns { display:flex; gap:6px; flex:none; }
        button { padding:4px 8px; border:1px solid var(--mx-border,#e5e7eb); background:#fff;
                 border-radius:7px; cursor:pointer; font:inherit; font-size:12px; color:var(--mx-text,#111827); }
        .again { border-color:var(--mx-accent,#16a34a); color:var(--mx-accent,#16a34a); }
        .empty { font-size:12px; color:var(--mx-muted,#6b7280); margin:4px 0; }
      </style>
      <h2>📚 ${t('catalog')}</h2>
      <div class="cat"></div>
      <h2>🕘 ${t('history')}</h2>
      <div class="hist"></div>
    `;
    this._catEl = this.shadowRoot.querySelector('.cat');
    this._histEl = this.shadowRoot.querySelector('.hist');
    this._renderCatalog();
    this._renderHistory();
  }

  _renderCatalog() {
    const items = this._catalog || [];
    if (!items.length) { this._catEl.innerHTML = `<p class="empty">${t('catalogEmpty')}</p>`; return; }
    this._catEl.innerHTML = items.map((item, i) => `
      <div class="item">
        <div class="name">
          <div>${esc(composeName(item))}</div>
          ${item.note ? `<div class="note">${esc(item.note)}</div>` : ''}
        </div>
        <div class="btns">
          <button class="again" data-i="${i}">${t('printAgain')}</button>
          <button class="rm" data-i="${i}">${t('delete')}</button>
        </div>
      </div>`).join('');
    this._catEl.querySelectorAll('.again').forEach(b => b.addEventListener('click', () => {
      emit(this, 'mx:printAgain', { item: this._catalog[+b.dataset.i] });
    }));
    this._catEl.querySelectorAll('.rm').forEach(b => b.addEventListener('click', () => {
      if (removeCatalogItem) removeCatalogItem(+b.dataset.i);
      this.refresh();
    }));
  }

  _renderHistory() {
    const h = this._history || [];
    if (!h.length) { this._histEl.innerHTML = `<p class="empty">${t('historyEmpty')}</p>`; return; }
    this._histEl.innerHTML = `
      <div class="item">
        <button class="clearhist">${t('batchClear')}</button>
      </div>` + h.map((e, i) => `
      <div class="item">
        <div class="name"><div>${esc(e.name || '')}</div><div class="note">${e.copies > 1 ? '×' + e.copies + ' · ' : ''}${fmtDate(e.ts)}</div></div>
      </div>`).join('');
    this._histEl.querySelector('.clearhist').addEventListener('click', () => {
      if (clearHistory) clearHistory();
      this.refresh();
    });
  }
}
defineEl('mx-catalog', MxCatalog);
