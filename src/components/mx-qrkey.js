// ===== mx-qrkey: режим «QR-ключ» — ввод, подбор QR, предпросмотр =====
// Значения полей живут только в памяти этого элемента: не сохраняются, не логируются,
// не уходят в события (наружу — только флаг canPrint). Печатью управляет mx-actions.
import { t } from '../core/i18n.js';
import { fitQr, renderQrKey, clampSide, effectiveSide, QR_MAX_CHARS, QR_MAX_CAPTION,
         QR_DEFAULT_SIDE_MM, QR_MIN_SIDE_MM, QR_MAX_SIDE_MM, QR_MAX_SIDE_CAPTION_MM } from '../core/qrkey.js';
import { PX_PER_MM } from '../core/protocol.js';
import { esc, emit, Base, defineEl } from './util.js';

const SIDE_PRESETS = [30, 40, 48];
const DEBOUNCE_MS = 150;     // генерация QR v40 на каждый символ дорогая — откладываем

export class MxQrKey extends Base {
  constructor() {
    super();
    this._text = '';
    this._caption = '';
    this._side = QR_DEFAULT_SIDE_MM;
    this._fit = fitQr('', this._side);
    this._dirty = false;
    this._timer = null;
    this._canvas = null;
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();
    this._onLang = () => this.render();
    document.addEventListener('mx:lang', this._onLang);
  }
  disconnectedCallback() {
    if (this._onLang) document.removeEventListener('mx:lang', this._onLang);
    clearTimeout(this._timer);
  }

  // ---------- API для mx-actions ----------
  // Актуальное состояние: сбрасывает отложенный пересчёт и возвращает canvas для печати.
  prepare() {
    this._flush();
    return this._fit.ok && this._text.trim() ? this._canvas : null;
  }
  get canPrint() {
    this._flush();
    return !!(this._fit.ok && this._text.trim());
  }
  get canvas() { return this._canvas; }
  clear() {
    this._text = '';
    this._caption = '';
    if (this._ta) this._ta.value = '';
    if (this._cap) this._cap.value = '';
    this._dirty = true;
    this._flush();
    this._grow();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; background:var(--mx-card-bg,#fff); border-radius:var(--mx-radius,14px);
                padding:14px; margin:10px 0; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        label { display:block; margin:8px 0; font-size:13px; color:var(--mx-muted,#6b7280); }
        textarea, input[type=text], input[type=number] { display:block; width:100%; box-sizing:border-box;
                margin-top:3px; padding:8px 9px; border:1px solid var(--mx-border,#e5e7eb); border-radius:8px;
                font:inherit; color:var(--mx-text,#111827); background:#fff; }
        textarea { min-height:72px; resize:none; overflow:hidden; font-family:ui-monospace,Menlo,Consolas,monospace; }
        textarea:focus, input:focus { outline:2px solid var(--mx-accent,#16a34a); outline-offset:-1px; }
        .meta { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:12px;
                color:var(--mx-muted,#6b7280); }
        .count.over { color:#b91c1c; }
        button { padding:7px 12px; border:1px solid var(--mx-border,#e5e7eb); background:#fff; border-radius:9px;
                 cursor:pointer; font:inherit; font-size:13px; color:var(--mx-text,#111827); }
        button.on { background:var(--mx-accent,#16a34a); border-color:var(--mx-accent,#16a34a); color:#fff; }
        .sidebox { display:flex; gap:8px; align-items:flex-end; }
        .sidebox label { flex:1; margin-bottom:0; }
        .presets { display:flex; gap:6px; }
        .info { font-size:13px; margin:10px 0 6px; white-space:pre-line; color:var(--mx-text,#111827); min-height:18px; }
        .note { font-size:12px; border-radius:8px; padding:7px 9px; margin:6px 0; }
        .warn { background:#fef3c7; color:#92400e; }
        .err { background:#fee2e2; color:#991b1b; }
        .priv { font-size:12px; color:var(--mx-muted,#6b7280); margin:8px 0 0; }
        .pv { text-align:center; margin-top:8px; }
        canvas { width:100%; max-width:384px; height:auto; image-rendering:pixelated; background:#fff;
                 border:1px dashed var(--mx-border,#e5e7eb); }
      </style>
      <label>${esc(t('qrData'))}
        <textarea class="data" maxlength="${QR_MAX_CHARS}" rows="3" autocomplete="off" autocapitalize="off"
                  autocorrect="off" spellcheck="false"></textarea>
      </label>
      <div class="meta">
        <span class="count"></span>
        <button class="clear" type="button">${esc(t('qrClear'))}</button>
      </div>
      <label>${esc(t('qrCaption'))}
        <input type="text" class="caption" maxlength="${QR_MAX_CAPTION}" autocomplete="off" autocapitalize="off"
               autocorrect="off" spellcheck="false">
      </label>
      <div class="sidebox">
        <label>${esc(t('qrSide'))}
          <input type="number" class="side" min="${QR_MIN_SIDE_MM}" max="${QR_MAX_SIDE_MM}" step="1">
        </label>
        <div class="presets">
          ${SIDE_PRESETS.map(n => `<button type="button" class="preset" data-v="${n}">${esc(t('qrSidePreset', n))}</button>`).join('')}
        </div>
      </div>
      <div class="info"></div>
      <div class="note warn" hidden></div>
      <div class="note err" hidden></div>
      <div class="pv" hidden><canvas aria-label="${esc(t('qrPreview'))}"></canvas></div>
      <p class="priv">${esc(t('qrPrivacy'))}</p>
    `;
    const q = s => this.shadowRoot.querySelector(s);
    this._ta = q('.data');
    this._cap = q('.caption');
    this._sideEl = q('.side');
    this._count = q('.count');
    this._info = q('.info');
    this._warn = q('.warn');
    this._err = q('.err');
    this._pv = q('.pv');
    this._canvas = q('canvas');
    this._ta.value = this._text;
    this._cap.value = this._caption;
    this._sideEl.value = this._side;

    this._ta.addEventListener('input', () => { this._text = this._ta.value; this._grow(); this._touch(); });
    this._cap.addEventListener('input', () => { this._caption = this._cap.value; this._touch(); });
    this._sideEl.addEventListener('input', () => {
      const v = Math.round(+this._sideEl.value);
      if (v >= QR_MIN_SIDE_MM && v <= QR_MAX_SIDE_MM) { this._side = v; this._touch(); }
    });
    this._sideEl.addEventListener('change', () => {
      this._side = clampSide(this._sideEl.value);
      this._sideEl.value = this._side;
      this._touch();
    });
    this.shadowRoot.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => {
      this._side = clampSide(b.dataset.v);
      this._sideEl.value = this._side;
      this._touch();
    }));
    q('.clear').addEventListener('click', () => this.clear());
    this._dirty = true;
    this._flush();
    this._grow();
  }

  _grow() {
    if (!this._ta) return;
    this._ta.style.height = 'auto';
    this._ta.style.height = this._ta.scrollHeight + 2 + 'px';
  }

  _touch() {
    this._dirty = true;
    this._count.textContent = t('qrCount', this._text.length, QR_MAX_CHARS);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flush(), DEBOUNCE_MS);
  }

  _flush() {
    if (!this._dirty || !this._ta) return;
    clearTimeout(this._timer);
    this._dirty = false;
    this._side = clampSide(this._side);          // поле ввода не перезаписываем — выбранная сторона запоминается
    const eff = effectiveSide(this._side, this._caption);
    const capped = eff < this._side;
    const f = this._fit = fitQr(this._text, eff);
    this._count.textContent = t('qrCount', this._text.length, QR_MAX_CHARS);
    this._count.classList.toggle('over', this._text.length >= QR_MAX_CHARS);
    this._warn.hidden = !(f.ok && f.warn);
    this._warn.textContent = f.ok && f.warn ? t('qrWarnModule2') : '';
    const blocked = !f.ok && f.reason !== 'empty';
    this._err.hidden = !blocked;
    this._err.textContent = !blocked ? ''
      : f.reason === 'needMm' ? t('qrErrNeed', f.sideMm, f.needMm) : t('qrErrTooMuch');
    for (const b of this.shadowRoot.querySelectorAll('.preset')) b.classList.toggle('on', +b.dataset.v === this._side);
    const hint = capped ? t('qrSideCapped', QR_MAX_SIDE_CAPTION_MM) : '';
    let info = '';
    if (f.ok) {
      const { W, H } = renderQrKey(this._canvas, f, this._caption);
      info = t('qrInfo', f.version, f.ec, f.modulePx, +(W / PX_PER_MM).toFixed(1), +(H / PX_PER_MM).toFixed(1));
    }
    this._info.textContent = [info, hint].filter(Boolean).join('\n');
    this._pv.hidden = !f.ok;
    emit(this, 'mx:qrstate', { canPrint: !!(f.ok && this._text.trim()) });   // без содержимого полей
  }
}
defineEl('mx-qrkey', MxQrKey);
