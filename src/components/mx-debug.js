// ===== mx-debug: журнал отладки с копированием =====
import { t } from '../core/i18n.js';
import { esc, Base, defineEl } from './util.js';

export class MxDebug extends Base {
  constructor() {
    super();
    this._lines = [];
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();
    this._bindLang();
    this._logEnv();
  }
  disconnectedCallback() { if (this._onLang) document.removeEventListener('mx:lang', this._onLang); }

  _bindLang() {
    this._onLang = () => this.refresh();
    document.addEventListener('mx:lang', this._onLang);
  }

  refresh() { if (this.shadowRoot) this.render(); }

  _logEnv() {
    this.log('UA: ' + ((typeof navigator !== 'undefined' && navigator.userAgent) || 'n/a'));
    this.log('URL: ' + ((typeof location !== 'undefined' && location.href) || 'n/a'));
    this.log('Web Bluetooth: ' + ((typeof navigator !== 'undefined' && navigator.bluetooth) ? 'доступен' : 'НЕ доступен'));
  }

  log(msg) {
    const d = new Date();
    const ts = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(x => String(x).padStart(2, '0')).join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
    this._lines.push(`[${ts}] ${msg}`);
    this._sync();
  }

  clear() {
    this._lines = [];
    this._sync();
  }

  _sync() {
    if (this._pre) this._pre.textContent = this._lines.join('\n');
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        summary { font-size:15px; cursor:pointer; color:var(--mx-text,#111827); }
        .hint { font-size:12px; color:var(--mx-muted,#6b7280); margin:6px 0; }
        .row { display:flex; gap:8px; margin:6px 0; }
        button { padding:7px 12px; border:1px solid var(--mx-border,#e5e7eb); background:#fff;
                 border-radius:8px; cursor:pointer; font:inherit; color:var(--mx-text,#111827); font-size:12px; }
        pre { background:#0f172a; color:#e2e8f0; border-radius:8px; padding:10px; font-size:11px;
              max-height:200px; overflow:auto; white-space:pre-wrap; word-break:break-all; }
      </style>
      <details>
        <summary>${t('debug')}</summary>
        <p class="hint">${t('debugHint')}</p>
        <div class="row">
          <button class="copy">${t('copyReport')}</button>
          <button class="clear">${t('batchClear')}</button>
        </div>
        <pre></pre>
      </details>
    `;
    this._pre = this.shadowRoot.querySelector('pre');
    this.shadowRoot.querySelector('.copy').addEventListener('click', () => this._copy());
    this.shadowRoot.querySelector('.clear').addEventListener('click', () => this.clear());
    this._sync();
  }

  async _copy() {
    const text = this._lines.join('\n');
    const btn = this.shadowRoot.querySelector('.copy');
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = t('copied');
    } catch (_) {
      btn.textContent = t('pressCtrlC');
      const range = document.createRange();
      range.selectNodeContents(this._pre);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}
defineEl('mx-debug', MxDebug);
