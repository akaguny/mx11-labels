// ===== mx-preflight: готовность к печати (браузер, контекст, BLE, адаптер, принтер) =====
import { t } from '../core/i18n.js';
import { esc, Base, defineEl } from './util.js';

export class MxPreflight extends Base {
  constructor() {
    super();
    this._connected = false;
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

  set connected(v) { this._connected = !!v; }
  get connected() { return this._connected; }

  refresh() { if (this.shadowRoot) this.render(); }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        h2 { margin:0 0 8px; font-size:15px; }
        .head { display:flex; align-items:center; justify-content:space-between; }
        button { padding:7px 12px; border:1px solid var(--mx-border,#e5e7eb); background:#fff;
                 border-radius:8px; cursor:pointer; font:inherit; color:var(--mx-text,#111827); font-size:12px; }
        ul { list-style:none; margin:8px 0 0; padding:0; }
        li { display:flex; justify-content:space-between; align-items:center; gap:8px;
             padding:5px 8px; font-size:13px; border-bottom:1px dashed var(--mx-border,#e5e7eb); }
        li:last-child { border-bottom:none; }
        .lbl { color:var(--mx-muted,#6b7280); }
        .val { font-weight:600; }
        .ok .val { color:var(--mx-accent,#16a34a); }
        .bad .val { color:#dc2626; }
        .unk .val { color:#9ca3af; }
      </style>
      <div class="head">
        <h2>🛡️ ${t('ready')}</h2>
        <button class="recheck">${t('recheck')}</button>
      </div>
      <ul class="checks"></ul>
    `;
    this.style.display = 'none';
    this._checksEl = this.shadowRoot.querySelector('.checks');
    this.shadowRoot.querySelector('.recheck').addEventListener('click', () => this.run());
    this.run();
  }

  async run() {
    if (!this.shadowRoot) return;
    this.style.display = '';
    const ua = (typeof navigator !== 'undefined') ? (navigator.userAgent || '') : '';
    const browserText = /Edg\//i.test(ua) ? 'Edge' : (/Chrome\//i.test(ua) ? 'Chrome' : '?');
    const checks = [
      { key: 'browser', label: t('preflightBrowser'), ok: /Chrome|Edg\//i.test(ua), text: browserText },
      { key: 'secure', label: t('preflightSecure'), ok: (typeof isSecureContext !== 'undefined') ? !!isSecureContext : null, text: '✓' },
      { key: 'bt', label: t('preflightBt'), ok: !!(typeof navigator !== 'undefined' && navigator.bluetooth), text: '✓' },
      { key: 'adapter', label: t('preflightAdapter'), ok: null, text: '…' },
      { key: 'printer', label: t('preflightPrinter'), ok: this._connected, text: this._connected ? t('printerConnected') : t('printerNotConnected') },
    ];
    this._renderList(checks);

    if (typeof navigator !== 'undefined' && navigator.bluetooth && navigator.bluetooth.getAvailability) {
      try {
        const avail = await navigator.bluetooth.getAvailability();
        this._patchRow('adapter', avail, avail ? '✓' : '—');
      } catch (_) {
        this._patchRow('adapter', null, '?');
      }
    } else {
      this._patchRow('adapter', null, '?');
    }
  }

  _renderList(checks) {
    this._checksEl.innerHTML = checks.map(c => `
      <li class="${c.ok === true ? 'ok' : (c.ok === false ? 'bad' : 'unk')}" data-key="${c.key}">
        <span class="lbl">${esc(c.label)}</span>
        <span class="val">${esc(c.text)}</span>
      </li>`).join('');
  }

  _patchRow(key, ok, text) {
    const li = this._checksEl.querySelector(`[data-key="${key}"]`);
    if (!li) return;
    li.className = ok === true ? 'ok' : (ok === false ? 'bad' : 'unk');
    li.querySelector('.val').textContent = text;
  }
}
defineEl('mx-preflight', MxPreflight);
