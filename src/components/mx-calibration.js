// ===== mx-calibration: калибровка экрана по банковской карте =====
import { t } from '../core/i18n.js';
import { saveSettings } from '../core/store.js';
import { clamp, Base, defineEl } from './util.js';

export class MxCalibration extends Base {
  constructor() {
    super();
    this._settings = {};
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

  get settings() { return this._settings; }
  set settings(v) { this._settings = { ...(this._settings), ...(v || {}) }; if (this.shadowRoot) this.render(); }

  refresh() { if (this.shadowRoot) this.render(); }

  _cal() { return clamp(+this._settings.cal || 100, 50, 200); }

  render() {
    const cal = this._cal();
    const screenCal = clamp(cal / 100, 0.5, 2);
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        summary { font-size:15px; cursor:pointer; color:var(--mx-text,#111827); }
        .hint { font-size:12px; color:var(--mx-muted,#6b7280); line-height:1.5; margin:8px 0; }
        .rect { border:2px solid var(--mx-accent,#16a34a); border-radius:4px; margin:10px auto; }
        .row { display:flex; align-items:center; gap:8px; margin-top:8px; }
        input[type=range] { flex:1; }
        .out { min-width:44px; font-weight:600; color:var(--mx-text,#111827); }
        button { padding:7px 12px; border:1px solid var(--mx-border,#e5e7eb); background:#fff;
                 border-radius:8px; cursor:pointer; font:inherit; color:var(--mx-text,#111827); }
      </style>
      <details>
        <summary>${t('calibrate')}</summary>
        <p class="hint">${t('calibrateHint')}</p>
        <div class="rect" style="width:${(85.6 * screenCal).toFixed(1)}mm;height:${(54 * screenCal).toFixed(1)}mm"></div>
        <div class="row">
          <input type="range" class="range" min="50" max="200" step="0.5" value="${cal}">
          <span class="out">${Math.round(cal)}%</span>
          <button class="reset">${t('calReset')}</button>
        </div>
      </details>
    `;
    this._range = this.shadowRoot.querySelector('.range');
    this._out = this.shadowRoot.querySelector('.out');
    this._rect = this.shadowRoot.querySelector('.rect');
    this._range.addEventListener('input', () => this._apply(+this._range.value));
    this.shadowRoot.querySelector('.reset').addEventListener('click', () => { this._range.value = 100; this._apply(100); });
  }

  _apply(cal) {
    const screenCal = clamp(cal / 100, 0.5, 2);
    this._out.textContent = Math.round(cal) + '%';
    this._rect.style.width = (85.6 * screenCal).toFixed(1) + 'mm';
    this._rect.style.height = (54 * screenCal).toFixed(1) + 'mm';
    if (typeof location !== 'undefined') {
      try { location.hash = 'cal=' + cal; } catch (_) {}
    }
    if (saveSettings) saveSettings({ cal });
    this._settings = { ...this._settings, cal };
    if (typeof this.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      this.dispatchEvent(new CustomEvent('mx:settings', { detail: { settings: { ...this._settings, cal } }, bubbles: true, composed: true }));
    }
  }
}
defineEl('mx-calibration', MxCalibration);
