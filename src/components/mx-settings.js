// ===== mx-settings: настройки печати (пресеты, ориентация, размер, копии, насыщенность…) =====
import { t } from '../core/i18n.js';
import { layout } from '../core/label.js';
import { clamp, Base, defineEl } from './util.js';

const PRESETS = {
  '67x25': { wmm: 67, hmm: 25, orient: 'auto' },
  '67x20': { wmm: 67, hmm: 20, orient: 'auto' },
  '90x14': { wmm: 90, hmm: 14, orient: 'auto' },
  '48x15': { wmm: 48, hmm: 15, orient: 'auto' },
};
const PRESET_KEYS = ['67x25', '67x20', '90x14', '48x15', 'custom'];

export class MxSettings extends Base {
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
  set settings(v) {
    const n = v || {};
    const cur = this._settings || {};
    if (n.preset === cur.preset && n.orient === cur.orient && +n.wmm === +cur.wmm &&
        +n.hmm === +cur.hmm && +n.offmm === +cur.offmm && +n.copies === +cur.copies &&
        +n.tear === +cur.tear && +n.energy === +cur.energy && !!n.border === !!cur.border) return;
    this._settings = { ...cur, ...n };
    if (this.shadowRoot) this.render();
  }

  refresh() { if (this.shadowRoot) this.render(); }

  render() {
    const s = this._settings || {};
    const lay = layout(s.wmm, s.hmm, s.orient);
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        label { display:block; margin:8px 0; font-size:13px; color:var(--mx-muted,#6b7280); }
        select, input[type=number], input[type=range] { display:block; width:100%; box-sizing:border-box;
                margin-top:3px; padding:7px 9px; border:1px solid var(--mx-border,#e5e7eb); border-radius:8px;
                font:inherit; color:var(--mx-text,#111827); background:#fff; }
        select:focus, input:focus { outline:2px solid var(--mx-accent,#16a34a); outline-offset:-1px; }
        input[type=range] { padding:0; border:none; }
        input[type=checkbox] { display:inline-block; width:auto; margin:0 6px 0 0; }
        .row { display:flex; gap:10px; }
        .row label { flex:1; }
        .eng { font-weight:600; color:var(--mx-text,#111827); }
      </style>
      <label>${t('preset')}
        <select class="preset">
          ${PRESET_KEYS.map(k => `<option value="${k}">${t('preset' + (k === 'custom' ? 'Custom' : k))}</option>`).join('')}
        </select>
      </label>
      <label>${t('orient')}
        <select class="orient">
          <option value="auto">${t('orientAuto')}</option>
          <option value="across">${t('orientAcross')}</option>
          <option value="along">${t('orientAlong')}</option>
        </select>
      </label>
      <div class="row">
        <label>${t('widthMm', lay.maxWmm)}
          <input type="number" class="wmm" min="20" max="${lay.maxWmm}" step="0.5">
        </label>
        <label>${t('heightMm', lay.maxHmm)}
          <input type="number" class="hmm" min="8" max="${lay.maxHmm}" step="0.5">
        </label>
      </div>
      <label>${t('offsetMm')}
        <input type="number" class="off" min="0" max="20" step="0.5">
      </label>
      <div class="row">
        <label>${t('copies')}
          <input type="number" class="copies" min="1" max="10" step="1">
        </label>
        <label>${t('tear')}
          <input type="number" class="tear" min="0" max="25" step="0.5">
        </label>
      </div>
      <label>${t('energy')}
        <input type="range" class="energy" min="30" max="100" step="1">
        <span class="eng"></span>%
      </label>
      <label class="border"><input type="checkbox" class="borderchk"> ${t('border')}</label>
    `;
    this._preset = this.shadowRoot.querySelector('.preset');
    this._orient = this.shadowRoot.querySelector('.orient');
    this._wmm = this.shadowRoot.querySelector('.wmm');
    this._hmm = this.shadowRoot.querySelector('.hmm');
    this._off = this.shadowRoot.querySelector('.off');
    this._copies = this.shadowRoot.querySelector('.copies');
    this._tear = this.shadowRoot.querySelector('.tear');
    this._energy = this.shadowRoot.querySelector('.energy');
    this._energyOut = this.shadowRoot.querySelector('.eng');
    this._border = this.shadowRoot.querySelector('.borderchk');
    this._sync();
    this._preset.addEventListener('change', () => this._applyPreset());
    this._orient.addEventListener('change', () => { this._updateMax(); this._emit(); });
    for (const el of [this._wmm, this._hmm]) {
      el.addEventListener('input', () => { this._preset.value = 'custom'; this._updateMax(); this._emit(); });
    }
    this._off.addEventListener('input', () => this._emit());
    this._copies.addEventListener('input', () => this._emit());
    this._tear.addEventListener('input', () => this._emit());
    this._energy.addEventListener('input', () => { this._energyOut.textContent = this._energy.value; this._emit(); });
    this._border.addEventListener('change', () => this._emit());
  }

  _sync() {
    const s = this._settings || {};
    this._preset.value = PRESET_KEYS.includes(s.preset) ? s.preset : 'custom';
    this._orient.value = s.orient || 'auto';
    this._wmm.value = s.wmm != null ? s.wmm : 67;
    this._hmm.value = s.hmm != null ? s.hmm : 25;
    this._off.value = s.offmm != null ? s.offmm : 0;
    this._copies.value = s.copies != null ? s.copies : 1;
    this._tear.value = s.tear != null ? s.tear : 0;
    this._energy.value = s.energy != null ? s.energy : 100;
    this._energyOut.textContent = this._energy.value;
    this._border.checked = s.border !== false;
    this._updateMax();
  }

  _updateMax() {
    const lay = layout(+this._wmm.value || 67, +this._hmm.value || 15, this._orient.value);
    this._wmm.max = lay.maxWmm;
    this._hmm.max = lay.maxHmm;
  }

  _applyPreset() {
    const p = this._preset.value;
    if (p === 'custom') { this._emit(); return; }
    const def = PRESETS[p];
    const s = this._read();
    this._settings = { ...s, ...def, preset: p };
    this._preset.value = p;
    this._sync();
    this._emit();
  }

  _read() {
    return {
      preset: this._preset.value,
      orient: this._orient.value,
      wmm: +this._wmm.value || 67,
      hmm: +this._hmm.value || 15,
      offmm: +this._off.value || 0,
      copies: clamp(+this._copies.value || 1, 1, 10),
      tear: clamp(+this._tear.value || 0, 0, 25),
      energy: clamp(+this._energy.value || 100, 30, 100),
      border: this._border.checked,
      bigPreview: !!this._settings.bigPreview,
      cal: this._settings.cal != null ? this._settings.cal : 100,
    };
  }

  _emit() {
    const s = this._read();
    this._settings = { ...this._settings, ...s };
    if (typeof this.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      this.dispatchEvent(new CustomEvent('mx:settings', { detail: { settings: s }, bubbles: true, composed: true }));
    }
  }
}
defineEl('mx-settings', MxSettings);
