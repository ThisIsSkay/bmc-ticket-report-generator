/** Debounce expensive settings serialization while permitting an explicit save/flush. */
export function createDebouncedSaver(persist, delay = 400, clock = { schedule: setTimeout, cancel: clearTimeout }) {
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
