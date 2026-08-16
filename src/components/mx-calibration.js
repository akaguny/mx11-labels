// ===== mx-calibration: калибровка экрана по банковской карте =====
import { t } from '../core/i18n.js';
import { saveSettings } from '../core/store.js';
import { clamp, Base, defineEl } from './util.js';

const CARD_W = 85.6, CARD_H = 54;   // ISO/IEC 7810 ID-1, мм

export class MxCalibration extends Base {
  constructor() {
    super();
    this._settings = {};
    this._open = false;   // сохранённое состояние details
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
  set settings(v) {
    this._settings = { ...(this._settings), ...(v || {}) };
    if (this.shadowRoot) this._sync();   // обновляем значения, НЕ пересоздаём DOM
  }

  refresh() { if (this.shadowRoot) this.render(); }

  _cal() { return clamp(+this._settings.cal || 100, 50, 200); }

  // Карта повёрнута горизонтально, если в вертикальном виде не влезает по ширине
  _horizontal() {
    const screenCal = clamp(this._cal() / 100, 0.5, 2);
    const availPx = (this.shadowRoot && this.shadowRoot.querySelector('.box'))
      ? this.shadowRoot.querySelector('.box').clientWidth : 500;
    const availMm = availPx * 25.4 / 96;   // CSS px → мм (96 dpi)
    return (CARD_W * screenCal) > (availMm - 8);
  }

  render() {
    const cal = this._cal();
    const screenCal = clamp(cal / 100, 0.5, 2);
    const horiz = this._horizontal();
    const w = (horiz ? CARD_H : CARD_W) * screenCal;
    const h = (horiz ? CARD_W : CARD_H) * screenCal;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        summary { font-size:15px; cursor:pointer; color:var(--mx-text,#111827); }
        .hint { font-size:12px; color:var(--mx-muted,#6b7280); line-height:1.5; margin:8px 0; }
        .box { width:100%; overflow-x:auto; }
        .rect { border:2px solid var(--mx-accent,#16a34a); border-radius:4px; margin:10px auto;
                display:flex; align-items:center; justify-content:center; text-align:center;
                font-size:11px; color:var(--mx-accent,#16a34a); }
        .row { display:flex; align-items:center; gap:8px; margin-top:8px; }
        input[type=range] { flex:1; }
        .out { min-width:44px; font-weight:600; color:var(--mx-text,#111827); }
        button { padding:7px 12px; border:1px solid var(--mx-border,#e5e7eb); background:#fff;
                 border-radius:8px; cursor:pointer; font:inherit; color:var(--mx-text,#111827); }
      </style>
      <details ${this._open ? 'open' : ''}>
        <summary>${t('calibrate')}</summary>
        <p class="hint">${t('calibrateHint')}</p>
        <div class="box">
          <div class="rect" style="width:${w.toFixed(1)}mm;height:${h.toFixed(1)}mm">
            ${horiz ? '↔ ' : '↕ '}${t('calCardLabel')}<br>${CARD_W} × ${CARD_H} мм
          </div>
        </div>
        <div class="row">
          <input type="range" class="range" min="50" max="200" step="0.5" value="${cal}">
          <span class="out">${Math.round(cal)}%</span>
          <button class="reset">${t('calReset')}</button>
        </div>
      </details>
    `;
    this._details = this.shadowRoot.querySelector('details');
    this._details.addEventListener('toggle', () => { this._open = this._details.open; });
    this._box = this.shadowRoot.querySelector('.box');
    this._range = this.shadowRoot.querySelector('.range');
    this._out = this.shadowRoot.querySelector('.out');
    this._rect = this.shadowRoot.querySelector('.rect');
    this._range.addEventListener('input', () => this._apply(+this._range.value));
    this.shadowRoot.querySelector('.reset').addEventListener('click', () => { this._range.value = 100; this._apply(100); });
  }

  // Обновление значений без пересоздания DOM (details не схлопывается)
  _sync() {
    if (!this._range) return;
    const cal = this._cal();
    const screenCal = clamp(cal / 100, 0.5, 2);
    const horiz = this._horizontal();
    this._range.value = cal;
    this._out.textContent = Math.round(cal) + '%';
    this._rect.style.width = ((horiz ? CARD_H : CARD_W) * screenCal).toFixed(1) + 'mm';
    this._rect.style.height = ((horiz ? CARD_W : CARD_H) * screenCal).toFixed(1) + 'mm';
    this._rect.innerHTML = `${horiz ? '↔ ' : '↕ '}${t('calCardLabel')}<br>${CARD_W} × ${CARD_H} мм`;
  }

  _apply(cal) {
    const screenCal = clamp(cal / 100, 0.5, 2);
    const horiz = this._horizontal();
    this._out.textContent = Math.round(cal) + '%';
    this._rect.style.width = ((horiz ? CARD_H : CARD_W) * screenCal).toFixed(1) + 'mm';
    this._rect.style.height = ((horiz ? CARD_W : CARD_H) * screenCal).toFixed(1) + 'mm';
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
