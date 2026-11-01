const STORAGE_KEY = 'resume-studio-editor-heights-v1';
export const DEFAULT_EDITOR_HEIGHT = 280;
export const MIN_EDITOR_HEIGHT = 140;
export const MAX_EDITOR_HEIGHT = 2000;
const clamp = (height) =>
  Math.round(Math.max(MIN_EDITOR_HEIGHT, Math.min(MAX_EDITOR_HEIGHT, height)));

// Editor preferences stay in this browser, separate from resume content and PDF layout.
export function createEditorResizer(root) {
  const heights = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const [id, height] of Object.entries(saved).slice(-1000)) {
      if (/^field-[\w-]+$/.test(id) && Number.isFinite(height)) heights.set(id, clamp(height));
    }
  } catch {
    // Resizing still works when browser storage is unavailable.
  }
  const heightFor = (id) => heights.get(id) ?? DEFAULT_EDITOR_HEIGHT;
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(heights)));
    } catch {
      // Keep the in-memory preference if browser storage is full or disabled.
    }
  };
  const update = (handle, height) => {
    const id = handle.getAttribute('aria-controls');
    const editor = document.getElementById(id);
    if (!editor || !root.contains(editor)) return;
    const next = clamp(height);
    editor.style.height = `${next}px`;
    handle.setAttribute('aria-valuenow', String(next));
    heights.delete(id);
    heights.set(id, next);
    if (heights.size > 1000) heights.delete(heights.keys().next().value);
  };
  root.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-editor-height]');
    if (!handle || event.button !== 0) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    const startY = event.clientY;
    const startHeight = heightFor(handle.getAttribute('aria-controls'));
    const moving = (e) => {
      if (e.pointerId === event.pointerId) update(handle, startHeight + e.clientY - startY);
    };
    const stop = (e) => {
      if (e.pointerId !== event.pointerId) return;
      handle.removeEventListener('pointermove', moving);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      handle.removeEventListener('lostpointercapture', stop);
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      document.body.classList.remove('resizing-editor-height');
      save();
    };
    handle.addEventListener('pointermove', moving);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('lostpointercapture', stop);
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-editor-height');
  });
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-editor-height]')) event.preventDefault();
  });
  root.addEventListener('dblclick', (event) => {
    const handle = event.target.closest('[data-editor-height]');
    if (!handle) return;
    event.preventDefault();
    update(handle, DEFAULT_EDITOR_HEIGHT);
    save();
  });
  root.addEventListener('keydown', (event) => {
    const handle = event.target.closest('[data-editor-height]');
    if (!handle) return;
    const current = heightFor(handle.getAttribute('aria-controls'));
    const next = {
      ArrowUp: current - 40,
      ArrowDown: current + 40,
      Home: MIN_EDITOR_HEIGHT,
      End: MAX_EDITOR_HEIGHT,
      Enter: DEFAULT_EDITOR_HEIGHT,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    update(handle, next);
    save();
  });
  return { heightFor };
}
