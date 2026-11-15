/** Debounce expensive settings serialization while permitting an explicit save/flush. */
import {normalizeVariant,normalizeSender} from './email-themes.mjs';
/**
 * Merge stored or imported settings over the defaults. Unknown email variants
 * fall back to 'A' and sender details are always four trimmed strings, so the
 * UI, storage and renderer can never disagree about them.
 */
export function normalizeSettings(raw,defaults){
 const base=structuredClone(defaults);
 if(!raw||typeof raw!=='object')return {...base,emailVariant:normalizeVariant(base.emailVariant),emailSender:normalizeSender(base.emailSender)};
 return {...base,...raw,emailVariant:normalizeVariant(raw.emailVariant),emailSender:normalizeSender(raw.emailSender),signatures:Array.isArray(raw.signatures)?raw.signatures:base.signatures};
}
export function createDebouncedSaver(persist, delay = 400, clock = { schedule: (fn, ms) => setTimeout(fn, ms), cancel: (id) => clearTimeout(id) }) {
  let pending = null;
  function queue() {
    if (pending !== null) clock.cancel(pending);
    pending = clock.schedule(() => { pending = null; persist(); }, delay);
  }
  function flush() {
    if (pending === null) return;
    clock.cancel(pending);
    pending = null;
    persist();
  }
  function cancel() {
    if (pending !== null) clock.cancel(pending);
    pending = null;
  }
  return { queue, flush, cancel };
}
