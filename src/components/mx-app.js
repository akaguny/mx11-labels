// ===== mx-app: корневой контейнер — состояние, язык, события =====
import { setLang, detectLang, toggleLang, t } from '../core/i18n.js';
import { loadSettings, saveSettings, upsertCatalogItem, addHistoryEntry } from '../core/store.js';
import { MxPrinter } from '../core/ble.js';
import { esc, Base, defineEl } from './util.js';
import './mx-batch.js';
import './mx-filament.js';
import './mx-preview.js';
import './mx-settings.js';
import './mx-actions.js';
import './mx-preflight.js';
import './mx-calibration.js';
import './mx-debug.js';
import './mx-catalog.js';

export class MxApp extends Base {
  constructor() {
    super();
    this._settings = {};
    this._queue = [];
    this._filament = { brand: '', type: '', color: '', note: '' };
    this._editIndex = null;
    this._printer = null;
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    if (typeof setLang === 'function' && typeof detectLang === 'function') setLang(detectLang());
    if (typeof loadSettings === 'function') this._settings = loadSettings() || {};
    this._printer = new MxPrinter(msg => { try { this._debug.log(msg); } catch (_) {} });
    this.render();
    this._wire();
    this._applyState();
    this._pre.run();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; max-width:560px; margin:0 auto; padding:16px 12px;
                font-family:var(--mx-font,system-ui); color:var(--mx-text,#111827); }
        header { display:flex; align-items:flex-start; gap:10px; }
        .logo { font-size:26px; line-height:1; }
        .titlebox { flex:1; min-width:0; }
        h1 { font-size:19px; margin:2px 0 2px; }
        .sub { font-size:12px; color:var(--mx-muted,#6b7280); line-height:1.4; }
        .lang { border:1px solid var(--mx-border,#e5e7eb); background:var(--mx-card-bg,#fff);
                border-radius:9px; padding:7px 11px; cursor:pointer; font:inherit; font-size:13px;
                color:var(--mx-text,#111827); flex:none; margin-top:4px; }
        .lang:hover { border-color:var(--mx-accent,#16a34a); color:var(--mx-accent,#16a34a); }
        .howto { background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                 padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        .howto summary { font-size:15px; cursor:pointer; }
        .howto ol { font-size:12px; color:var(--mx-muted,#6b7280); line-height:1.6; margin:8px 0 0;
                    padding-left:18px; }
      </style>
      <header>
        <span class="logo">🏷️</span>
        <div class="titlebox">
          <h1>${t('appTitle')}</h1>
          <div class="sub">${t('appSub')}</div>
        </div>
        <button class="lang">${t('langName')}</button>
      </header>
      <main>
        <mx-batch></mx-batch>
        <mx-filament></mx-filament>
        <mx-preview></mx-preview>
        <mx-settings></mx-settings>
        <mx-actions></mx-actions>
        <mx-preflight></mx-preflight>
        <mx-calibration></mx-calibration>
        <mx-debug></mx-debug>
        <mx-catalog></mx-catalog>
      </main>
      <details class="howto">
        <summary>ℹ️ ${t('howTo')}</summary>
        <ol>${t('howToItems').map(i => `<li>${esc(i)}</li>`).join('')}</ol>
      </details>
    `;
    this._langBtn = this.shadowRoot.querySelector('.lang');
    this._howto = this.shadowRoot.querySelector('.howto');
    this._b = this.shadowRoot.querySelector('mx-batch');
    this._f = this.shadowRoot.querySelector('mx-filament');
    this._p = this.shadowRoot.querySelector('mx-preview');
    this._s = this.shadowRoot.querySelector('mx-settings');
    this._a = this.shadowRoot.querySelector('mx-actions');
    this._pre = this.shadowRoot.querySelector('mx-preflight');
    this._cal = this.shadowRoot.querySelector('mx-calibration');
    this._debug = this.shadowRoot.querySelector('mx-debug');
    this._c = this.shadowRoot.querySelector('mx-catalog');
  }

  _wire() {
    this._langBtn.addEventListener('click', () => this._toggleLang());
    this._b.addEventListener('mx:queue', e => this._onQueue(e));
    this._b.addEventListener('mx:editIndex', e => this._onEditIndex(e.detail.index));
    this._f.addEventListener('mx:filament', e => this._onFilament(e.detail));
    this._f.addEventListener('mx:addCatalog', e => this._onAddCatalog(e.detail.item));
    this._p.addEventListener('mx:editIndex', e => this._onEditIndex(e.detail.index));
    this._p.addEventListener('mx:settings', e => this._onSettings(e));
    this._s.addEventListener('mx:settings', e => this._onSettings(e));
    this._cal.addEventListener('mx:settings', e => this._onSettings(e));
    this._a.addEventListener('mx:history', e => this._onHistory(e.detail));
    this._a.addEventListener('mx:printerState', e => this._onPrinterState(e.detail));
    this._c.addEventListener('mx:printAgain', e => this._onPrintAgain(e.detail.item));
  }

  _applyState() {
    this._b.queue = this._queue;
    this._b.editIndex = this._editIndex;
    this._f.value = this._filament;
    this._p.filament = this._filament;
    this._p.settings = this._settings;
    this._p.queue = this._queue;
    this._p.editIndex = this._editIndex;
    this._s.settings = this._settings;
    this._a.printer = this._printer;
    this._a.settings = this._settings;
    this._a.queue = this._queue;
    this._a.filament = this._filament;
    this._cal.settings = this._settings;
    this._pre.connected = this._printer.isConnected;
  }

  _toggleLang() {
    if (typeof toggleLang === 'function') toggleLang();
    this.shadowRoot.querySelector('h1').textContent = t('appTitle');
    this.shadowRoot.querySelector('.sub').textContent = t('appSub');
    this._langBtn.textContent = t('langName');
    this._howto.innerHTML = `<summary>ℹ️ ${t('howTo')}</summary>
      <ol>${t('howToItems').map(i => `<li>${esc(i)}</li>`).join('')}</ol>`;
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('mx:lang'));
    }
  }

  _formEmpty() {
    const f = this._filament || {};
    return !(f.brand || f.type || f.color || f.note);
  }

  _onQueue(e) {
    const q = e.detail.queue || [];
    this._queue = q;
    if (e.detail.autoload && this._formEmpty()) {
      this._editIndex = null;
      this._filament = { ...e.detail.autoload };
      this._f.value = this._filament;
    }
    if (this._editIndex != null && this._editIndex >= this._queue.length) this._editIndex = null;
    this._syncQueue();
  }

  _syncQueue() {
    this._b.queue = this._queue;
    this._b.editIndex = this._editIndex;
    this._p.queue = this._queue;
    this._p.editIndex = this._editIndex;
    this._p.filament = this._filament;
    this._p.rerender();
    this._a.queue = this._queue;
  }

  _onEditIndex(i) {
    if (i == null || !this._queue[i]) return;
    this._editIndex = i;
    this._filament = { ...this._queue[i] };
    this._f.value = this._filament;
    this._b.editIndex = i;
    this._b.refresh();
    this._p.editIndex = i;
    this._p.filament = this._filament;
    this._p.rerender();
    this._a.filament = this._filament;
  }

  _onFilament(v) {
    const nv = { brand: v.brand || '', type: v.type || '', color: v.color || '', note: v.note || '' };
    this._filament = nv;
    this._a.filament = nv;
    if (this._editIndex != null && this._queue[this._editIndex]) {
      this._queue[this._editIndex] = { ...nv };
      this._syncQueue();
    } else {
      this._p.filament = nv;
      this._p.rerender();
    }
  }

  _onSettings(e) {
    const s = e.detail.settings || {};
    this._settings = { ...this._settings, ...s };
    if (typeof saveSettings === 'function') saveSettings(this._settings);
    this._p.settings = this._settings;
    this._s.settings = this._settings;
    this._cal.settings = this._settings;
    this._a.settings = this._settings;
  }

  _onAddCatalog(item) {
    if (typeof upsertCatalogItem === 'function') upsertCatalogItem(item || {});
    this._c.refresh();
  }

  _onHistory(detail) {
    if (typeof addHistoryEntry === 'function') addHistoryEntry(detail || {});
    this._c.refresh();
  }

  _onPrinterState(detail) {
    this._pre.connected = !!(detail && detail.connected);
    this._pre.run();
  }

  _onPrintAgain(item) {
    this._editIndex = null;
    this._filament = { ...item };
    this._f.value = this._filament;
    this._b.editIndex = null;
    this._b.refresh();
    this._p.editIndex = null;
    this._p.filament = this._filament;
    this._p.rerender();
    this._a.printItem(item);
  }
}
defineEl('mx-app', MxApp);
