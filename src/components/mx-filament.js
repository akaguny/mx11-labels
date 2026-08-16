// ===== mx-filament: поля текущей наклейки (бренд / тип / цвет / доп.строка) =====
import { t } from '../core/i18n.js';
import { loadCatalog } from '../core/store.js';
import { esc, emit, clamp, Base, defineEl } from './util.js';

const STD_BRANDS = [
  'Bambu Lab', 'eSUN', 'Creality', 'Sunlu', 'Polymaker', 'Prusament',
  'JAYO', 'OVERTURE', 'ERYONE', 'Geeetech', 'Extrudr', 'Filamentum',
  '3DJAKE', 'ColorFabb',
];
const STD_TYPES = [
  'PLA', 'PLA+', 'PLA-CF', 'PETG', 'PETG-CF', 'ABS', 'ASA', 'TPU',
  'TPU-95A', 'Nylon', 'PC', 'PVA', 'HIPS', 'PC-ABS', 'CF-PA',
];

export class MxFilament extends Base {
  constructor() {
    super();
    this._value = { brand: '', type: '', color: '', note: '' };
    this._emitting = false;
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

  get value() { return this._value; }
  set value(v) {
    this._value = { brand: '', type: '', color: '', note: '', ...(v || {}) };
    if (this._emitting) return;
    if (this.shadowRoot) this._syncInputs();
  }

  refresh() { if (this.shadowRoot) this.render(); }

  render() {
    const catalog = (loadCatalog && loadCatalog()) || [];
    const brands = [...STD_BRANDS];
    const types = [...STD_TYPES];
    for (const it of catalog) {
      if (it.brand && !brands.includes(it.brand)) brands.push(it.brand);
      if (it.type && !types.includes(it.type)) types.push(it.type);
    }
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        h2 { margin:0 0 10px; font-size:15px; }
        label { display:block; margin:8px 0; font-size:13px; color:var(--mx-muted,#6b7280); }
        input { display:block; width:100%; box-sizing:border-box; margin-top:3px; padding:8px 10px;
                border:1px solid var(--mx-border,#e5e7eb); border-radius:8px; font:inherit; color:var(--mx-text,#111827); }
        input:focus { outline:2px solid var(--mx-accent,#16a34a); outline-offset:-1px; }
      </style>
      <h2>🧵 ${t('filament')}</h2>
      <label>${t('brand')}
        <input class="f brand" list="mx-brands" placeholder="Bambu Lab">
        <datalist id="mx-brands">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
      </label>
      <label>${t('type')}
        <input class="f type" list="mx-types" placeholder="PLA">
        <datalist id="mx-types">${types.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
      </label>
      <label>${t('color')}
        <input class="f color" placeholder="White">
      </label>
      <label>${t('note')}
        <input class="f note" placeholder="220–240 °C">
      </label>
    `;
    this._inputs = {
      brand: this.shadowRoot.querySelector('.brand'),
      type: this.shadowRoot.querySelector('.type'),
      color: this.shadowRoot.querySelector('.color'),
      note: this.shadowRoot.querySelector('.note'),
    };
    for (const k of Object.keys(this._inputs)) {
      this._inputs[k].addEventListener('input', () => this._fromInput());
    }
    this._syncInputs();
  }

  _read() {
    return {
      brand: this._inputs.brand.value,
      type: this._inputs.type.value,
      color: this._inputs.color.value,
      note: this._inputs.note.value,
    };
  }

  _fromInput() {
    const v = this._read();
    this._value = v;
    this._emitting = true;
    try { emit(this, 'mx:filament', { ...v }); } finally { this._emitting = false; }
  }

  _syncInputs() {
    const v = this._value || {};
    for (const k of ['brand', 'type', 'color', 'note']) {
      if (this._inputs[k] && this._inputs[k].value !== (v[k] || '')) this._inputs[k].value = v[k] || '';
    }
  }
}
defineEl('mx-filament', MxFilament);
