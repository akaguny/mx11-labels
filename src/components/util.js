// ===== Общие утилиты для компонентов (без DOM-зависимостей на верхнем уровне) =====

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function emit(el, name, detail) {
  if (typeof el.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Безопасная база для классов, чтобы модули импортировались без DOM (node-проверки).
export const Base = (typeof HTMLElement !== 'undefined') ? HTMLElement : class {};

export function defineEl(tag, cls) {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, cls);
  }
}
