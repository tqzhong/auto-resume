import DOMPurify from 'dompurify';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { renderMarkdown } from './markdown.js';
import { fitHeaderPhoto } from './photo-layout.js';
import { prepareResumeFonts, sharePreviewFonts, createExportFrame } from './typography.js';
import {
  STORAGE_KEY,
  clone,
  uid,
  defaults,
  initialDocument,
  normalizeDocument,
  section,
  block,
  move,
} from './model.js';

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const md = (value) =>
  DOMPurify.sanitize(renderMarkdown(value), {
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style'],
    FORBID_ATTR: ['onerror', 'onload'],
  });
let doc = initialDocument(),
  persisted = true,
  saveTimer,
  previewTimer,
  historyTimer,
  toastTimer,
  revision = 0,
  readyRevision = -1,
  previewHeight = 1123;
let storedError = false;
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) doc = normalizeDocument(JSON.parse(stored));
} catch {
  storedError = true;
  persisted = false;
}
let history = [JSON.stringify(doc)],
  future = [];
const openModules = new Set(['header', ...doc.sections.slice(0, 2).map((x) => x.id)]);
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 4500);
}
function status(text, error = false) {
  $('save-status').textContent = text;
  $('save-status').style.color = error ? '#a65e45' : '';
}
function persist() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    persisted = true;
    status(
      `Saved in this browser · ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    );
  } catch {
    persisted = false;
    status('Browser storage is unavailable. Please download a backup.', true);
  }
  return persisted;
}
function record() {
  clearTimeout(historyTimer);
  const next = JSON.stringify(doc);
  if (history.at(-1) !== next) {
    history.push(next);
    if (history.length > 35) history.shift();
    future = [];
  }
  updateHistory();
}
function updateHistory() {
  $('undo').disabled = history.length < 2 && history.at(-1) === JSON.stringify(doc);
  $('redo').disabled = !future.length;
}
function changed({ rerender = false } = {}) {
  persisted = false;
  status('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 300);
  clearTimeout(historyTimer);
  historyTimer = setTimeout(record, 900);
  schedulePreview();
  if (rerender) renderEditor();
  updateHistory();
}
function mutate(fn) {
  record();
  fn();
  record();
  changed({ rerender: true });
}
function undo() {
  record();
  if (history.length < 2) return;
  future.push(history.pop());
  doc = normalizeDocument(JSON.parse(history.at(-1)));
  renderAll();
  persist();
  updateHistory();
  toast('Undone. You can redo this change.');
}
function redo() {
  if (!future.length) return;
  const next = future.pop();
  history.push(next);
  doc = normalizeDocument(JSON.parse(next));
  renderAll();
  persist();
  updateHistory();
}
function action(label, act, data = {}, className = '') {
  return `<button type="button" data-action="${act}" ${Object.entries(data)
    .map(([k, v]) => `data-${k}="${esc(v)}"`)
    .join(' ')} class="${className}">${label}</button>`;
}
function field({ label, value, target, id, key, rows = 1, remove = true, rich = false }) {
  const fieldId = `field-${target}-${id}-${key}`;
  const tools = rich
    ? `<div class="format-bar" aria-label="${esc(label)} formatting tools">${[
        ['B', 'bold', 'Bold'],
        ['I', 'italic', 'Italic'],
        ['U', 'underline', 'Underline'],
        ['Highlight', 'highlight', 'Highlight'],
        ['Link', 'link', 'Hyperlink'],
        ['• List', 'bullet', 'Bullet list'],
        ['1. List', 'number', 'Numbered list'],
        ['Math', 'math', 'Math'],
      ]
        .map(
          ([caption, format, title]) =>
            `<button type="button" data-format="${format}" data-for="${fieldId}" title="${title}">${caption}</button>`,
        )
        .join('')}</div>`
    : '';
  return `<label class="field" for="${fieldId}"><span class="field-label"><span>${label}</span>${remove ? `<button type="button" aria-label="Remove ${esc(label)}" data-action="remove-field" data-target="${target}" data-id="${id}" data-key="${key}" class="field-remove">×</button>` : ''}</span>${tools}<textarea id="${fieldId}" data-target="${target}" data-id="${id}" data-key="${key}" aria-label="${esc(label)}" rows="${rows}" class="${rich ? 'markdown-editor' : 'small'}" spellcheck="false">${esc(value)}</textarea></label>`;
}
function renderHeader() {
  return `<details class="edit-module" data-module="header" ${openModules.has('header') ? 'open' : ''}><summary class="module-summary"><span class="module-name">Profile & photo</span><span class="count">Header</span></summary><div class="module-content"><div class="photo-editor"><div class="photo-thumb">${doc.header.photo ? `<img src="${doc.header.photo}" alt="Current profile photo">` : '3 : 4 Photo'}</div><div class="photo-buttons"><label class="button" for="photo-file">${doc.header.photo ? 'Replace photo' : 'Add photo'}<input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp" class="sr-only"></label>${action(doc.header.photoHidden ? 'Restore photo frame' : 'Remove photo frame', 'toggle-photo')}${doc.header.photo ? action('Remove photo', 'delete-photo') : ''}<p>JPG / PNG / WebP · Included in backups</p></div></div>${doc.header.fields.map((f) => field({ label: f.kind === 'name' ? 'Name / headline' : f.kind === 'contact' ? 'Contact details' : 'Role / additional details', value: f.text, target: 'header', id: f.id, key: 'text', rows: f.kind === 'contact' ? 2 : 1 })).join('')}<div class="add-blocks">${action('＋ Headline', 'add-header', { kind: 'name' })}${action('＋ Details', 'add-header', { kind: 'text' })}${action('＋ Contact', 'add-header', { kind: 'contact' })}</div></div></details>`;
}
function renderBlock(b, s, index) {
  const controls = `<div class="block-actions">${action('↑', 'move-block', { section: s.id, id: b.id, dir: -1 })}${action('↓', 'move-block', { section: s.id, id: b.id, dir: 1 })}${action('Remove', 'delete-block', { section: s.id, id: b.id }, 'danger')}</div>`;
  let content = '';
  if (b.type === 'row')
    content = `<div class="row-fields">${b.left !== null ? field({ label: 'Left field', value: b.left, target: 'block', id: b.id, key: 'left' }) : `<div class="field">${action('＋ Left field', 'restore-field', { id: b.id, key: 'left' }, 'compact-btn')}</div>`}${b.right !== null ? field({ label: 'Date / right field', value: b.right, target: 'block', id: b.id, key: 'right' }) : `<div class="field">${action('＋ Right field', 'restore-field', { id: b.id, key: 'right' }, 'compact-btn')}</div>`}</div>`;
  else if (b.type === 'text')
    content = field({
      label: 'Body · Markdown',
      value: b.text,
      target: 'block',
      id: b.id,
      key: 'text',
      rows: 7,
      remove: false,
      rich: true,
    });
  else
    content =
      '<p class="muted">The following content starts on a new page. Move this break as needed.</p>';
  return `<div class="block-editor" data-block="${b.id}"><div class="block-head"><span>${String(index + 1).padStart(2, '0')} · ${b.type === 'row' ? 'Information row' : b.type === 'text' ? 'Text block' : 'Page break'}</span>${controls}</div>${content}</div>`;
}
function renderSection(s) {
  return `<details class="edit-module" data-module="${s.id}" ${openModules.has(s.id) ? 'open' : ''}><summary class="module-summary"><span class="module-name">${esc(s.title?.replace(/[*_~+=#]/g, '') || 'Untitled section')}</span><span class="count">${s.blocks.length} ${s.blocks.length === 1 ? 'block' : 'blocks'}</span></summary><div class="module-content"><div class="module-actions">${action('↑ Move up', 'move-section', { id: s.id, dir: -1 })}${action('↓ Move down', 'move-section', { id: s.id, dir: 1 })}${action('Duplicate section', 'duplicate-section', { id: s.id })}${action('Remove section', 'delete-section', { id: s.id }, 'danger')}</div>${s.title !== null ? field({ label: 'Section title', value: s.title, target: 'section', id: s.id, key: 'title' }) : `<div class="empty">Section title removed. ${action('Restore title', 'restore-title', { id: s.id }, 'compact-btn')}</div>`}${s.blocks.map((b, i) => renderBlock(b, s, i)).join('')}${!s.blocks.length ? '<div class="empty">This section is empty. Add a text block to get started.</div>' : ''}<div class="add-blocks">${action('＋ Information row', 'add-block', { section: s.id, type: 'row' })}${action('＋ Text block', 'add-block', { section: s.id, type: 'text' })}${action('＋ Page break', 'add-block', { section: s.id, type: 'break' })}</div></div></details>`;
}
function renderEditor() {
  const scroll = $('content-panel').scrollTop;
  $('editor-content').innerHTML = renderHeader() + doc.sections.map(renderSection).join('');
  $('content-panel').scrollTop = scroll;
  $('doc-name').value = doc.name;
  for (const detail of document.querySelectorAll('details[data-module]'))
    detail.addEventListener('toggle', () => {
      if (detail.open) openModules.add(detail.dataset.module);
      else openModules.delete(detail.dataset.module);
    });
}
function slider(key, label, min, max, step, unit) {
  return `<label class="slider-field"><span>${label}<output id="out-${key}">${doc.settings[key]}${unit}</output></span><input type="range" data-setting="${key}" aria-label="${label}" min="${min}" max="${max}" step="${step}" value="${doc.settings[key]}" data-unit="${unit}"></label>`;
}
function select(key, label, options) {
  return `<label class="settings-row">${label}<select data-setting="${key}" aria-label="${label}">${options.map(([value, name]) => `<option value="${value}" ${doc.settings[key] === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
}
function renderDesign() {
  $('design-content').innerHTML = `<div class="setting-group"><h2>Typography & color</h2>${select(
    'font',
    'Font family',
    [
      ['serif', 'Noto Serif'],
      ['sans', 'Noto Sans'],
    ],
  )}<label class="settings-row">Accent color<input type="color" data-setting="accent" aria-label="Accent color" value="${doc.settings.accent}"></label>${slider('fontSize', 'Body size', 10, 20, 0.5, ' px')}${slider('boldWeight', 'Bold weight', 700, 900, 100, '')}${slider('titleSize', 'Section title size', 15, 28, 0.5, ' px')}${slider('nameSize', 'Name size', 24, 46, 1, ' px')}</div><div class="setting-group"><h2>Spacing & margins</h2>${slider('lineHeight', 'Line height', 1.15, 2.2, 0.05, '×')}${slider('paragraphGap', 'Paragraph spacing', 0, 16, 1, ' px')}${slider('listGap', 'List spacing', 0, 12, 1, ' px')}${slider('headerGap', 'Header spacing', 0, 60, 1, ' px')}${slider('sectionGap', 'Section spacing', 4, 32, 1, ' px')}${slider('margin', 'Page margins', 8, 24, 0.5, ' mm')}</div><div class="setting-group"><h2>Photo</h2>${select(
    'photoSide',
    'Photo',
    [
      ['right', 'Right'],
      ['left', 'Left'],
    ],
  )}${select('photoShape', 'Photo shape', [
    ['square', '3 : 4 rectangle'],
    ['round', 'Circle'],
  ])}${select('photoSizing', 'Photo sizing', [
    ['auto', 'Match header height'],
    ['fixed', 'Fixed width'],
  ])}${doc.settings.photoSizing === 'auto' ? slider('photoMinHeight', 'Minimum photo height', 20, 40, 1, ' mm') : slider('photoWidth', 'Photo width', 20, 40, 1, ' mm')}<p class="muted">Auto sizing follows the visible header content, with a minimum height. Photos keep their shape and are cropped from the center.</p></div><button id="reset-design">Reset layout</button>`;
}
function renderAll() {
  renderEditor();
  renderDesign();
  schedulePreview(0);
}
function findBlock(id) {
  for (const s of doc.sections) {
    const b = s.blocks.find((b) => b.id === id);
    if (b) return b;
  }
  return null;
}
function targetField(el) {
  return el.dataset.target === 'header'
    ? doc.header.fields.find((f) => f.id === el.dataset.id)
    : el.dataset.target === 'section'
      ? doc.sections.find((s) => s.id === el.dataset.id)
      : findBlock(el.dataset.id);
}
function handleAction(button) {
  const a = button.dataset.action,
    id = button.dataset.id,
    sid = button.dataset.section,
    key = button.dataset.key;
  mutate(() => {
    const s = doc.sections.find((s) => s.id === id || s.id === sid),
      b = findBlock(id);
    if (a === 'add-header') {
      doc.header.fields.push({
        id: uid(),
        kind: button.dataset.kind,
        text: button.dataset.kind === 'name' ? 'Your name' : 'Add details',
      });
      openModules.add('header');
    }
    if (a === 'remove-field') {
      if (button.dataset.target === 'header')
        doc.header.fields = doc.header.fields.filter((f) => f.id !== id);
      else if (button.dataset.target === 'section') s.title = null;
      else if (b) b[key] = null;
    }
    if (a === 'restore-field' && b) b[key] = key === 'left' ? 'Left field' : 'Date';
    if (a === 'restore-title') s.title = 'Section title';
    if (a === 'toggle-photo') doc.header.photoHidden = !doc.header.photoHidden;
    if (a === 'delete-photo') doc.header.photo = null;
    if (a === 'delete-section') doc.sections = doc.sections.filter((s) => s.id !== id);
    if (a === 'move-section') move(doc.sections, id, Number(button.dataset.dir));
    if (a === 'duplicate-section') {
      const copy = clone(s);
      copy.id = uid();
      copy.blocks.forEach((b) => (b.id = uid()));
      doc.sections.splice(doc.sections.indexOf(s) + 1, 0, copy);
      openModules.add(copy.id);
    }
    if (a === 'add-block') {
      s.blocks.push(block(button.dataset.type));
      openModules.add(s.id);
    }
    if (a === 'delete-block') s.blocks = s.blocks.filter((b) => b.id !== id);
    if (a === 'move-block') move(s.blocks, id, Number(button.dataset.dir));
  });
  if (['delete-section', 'delete-block', 'remove-field', 'delete-photo'].includes(a))
    toast('Removed. Use Undo to restore.');
}
function applyFormat(button) {
  const area = $(button.dataset.for),
    start = area.selectionStart,
    end = area.selectionEnd,
    selected = area.value.slice(start, end),
    format = button.dataset.format;
  const wraps = {
    bold: ['**', '**', 'Highlighted text'],
    italic: ['*', '*', 'Italic'],
    underline: ['++', '++', 'Underline'],
    highlight: ['==', '==', 'Highlight'],
    link: ['[', '](https://example.com)', 'Link text'],
    math: ['$', '$', 'F_1=\\frac{2PR}{P+R}'],
  };
  let replacement;
  if (format === 'bullet' || format === 'number') {
    replacement = (selected || 'List item')
      .split('\n')
      .map((line, i) => `${format === 'bullet' ? '-' : i + 1 + '.'} ${line}`)
      .join('\n');
  } else {
    const [left, right, fallback] = wraps[format];
    replacement = left + (selected || fallback) + right;
  }
  area.setRangeText(replacement, start, end, 'select');
  area.focus();
  area.dispatchEvent(new Event('input', { bubbles: true }));
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action],[data-format],[data-close]');
  if (!button) return;
  event.preventDefault();
  if (button.dataset.close) {
    $(button.dataset.close).close();
    return;
  }
  if (button.dataset.format) applyFormat(button);
  else handleAction(button);
});
document.addEventListener('input', (event) => {
  const el = event.target;
  if (el.matches('textarea[data-target]')) {
    const target = targetField(el);
    if (target) {
      target[el.dataset.key] = el.value;
      if (el.dataset.target === 'section') {
        const detail = el.closest('details');
        detail.querySelector('.module-name').textContent =
          el.value.replace(/[*_~+=#]/g, '') || 'Untitled section';
      }
      changed();
    }
  }
  if (el.dataset.setting) {
    doc.settings[el.dataset.setting] = el.type === 'range' ? Number(el.value) : el.value;
    if ($('out-' + el.dataset.setting))
      $('out-' + el.dataset.setting).textContent = el.value + (el.dataset.unit || '');
    if (el.dataset.setting === 'photoSizing') renderDesign();
    changed();
  }
});
$('doc-name').addEventListener('input', (e) => {
  doc.name = e.target.value;
  changed();
});
$('add-section').addEventListener('click', () => {
  let added;
  mutate(() => {
    added = section();
    doc.sections.push(added);
    openModules.add(added.id);
  });
  document
    .querySelector(`[data-module="${added.id}"]`)
    .scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
document.addEventListener('click', (e) => {
  if (e.target.id === 'reset-design') {
    mutate(() => (doc.settings = { ...defaults }));
    renderDesign();
  }
});
for (const id of ['content-tab', 'design-tab'])
  $(id).addEventListener('click', () => {
    const content = id === 'content-tab';
    $('content-tab').setAttribute('aria-selected', String(content));
    $('design-tab').setAttribute('aria-selected', String(!content));
    $('content-panel').hidden = !content;
    $('design-panel').hidden = content;
  });
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('save').addEventListener('click', () => {
  record();
  if (persist()) toast('Saved. Reopen this address in the same browser to continue.');
  else toast('Saving failed. Download a backup to keep your work.');
});
$('help').addEventListener('click', () => $('help-dialog').showModal());
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function filename() {
  return (doc.name || 'My resume').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
}
$('backup').addEventListener('click', () => {
  persist();
  download(
    JSON.stringify({ ...doc, exportedAt: new Date().toISOString() }, null, 2),
    filename() + '.resume.json',
    'application/json',
  );
  toast('Backup downloaded with all content, layout settings, and photos.');
});
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 6 * 1024 * 1024) throw Error('Please choose a JSON backup smaller than 6 MB.');
    const next = normalizeDocument(JSON.parse(await file.text()));
    mutate(() => {
      doc = next;
      doc.sections.slice(0, 2).forEach((s) => openModules.add(s.id));
    });
    renderDesign();
    persist();
    toast('Backup imported. Use Undo to return to the previous draft.');
  } catch (error) {
    toast('Import failed: ' + error.message);
  }
  e.target.value = '';
});
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'photo-file') return;
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw Error('Choose a JPG, PNG, or WebP image.');
    if (file.size > 15 * 1024 * 1024) throw Error('Please choose a photo smaller than 15 MB.');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height)),
        canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      mutate(() => {
        doc.header.photo = canvas.toDataURL('image/jpeg', 0.88);
        doc.header.photoHidden = false;
      });
      toast('Photo added. It will be saved with your draft and backups.');
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    toast(error.message);
  }
});
window.addEventListener('beforeunload', (event) => {
  if (!persisted && !persist()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    persist();
    toast('Saved in this browser');
  }
  if (event.key.toLowerCase() === 'z' && !event.target.matches('textarea,input')) {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  }
});

function resumeMarkup() {
  const s = doc.settings,
    header = `<header class="cv-header ${doc.header.photoHidden ? 'without-photo' : ''} ${s.photoSide === 'left' ? 'photo-left' : ''}"><div class="header-fields">${doc.header.fields
      .filter((f) => f.text.trim())
      .map(
        (f) =>
          `<div class="${f.kind === 'name' ? 'cv-name' : f.kind === 'contact' ? 'cv-contact' : 'cv-headline'}">${md(f.text)}</div>`,
      )
      .join(
        '',
      )}</div>${doc.header.photoHidden ? '' : doc.header.photo ? `<img class="cv-photo ${s.photoShape === 'round' ? 'round' : ''}" src="${doc.header.photo}" alt="Profile photo">` : `<div class="cv-photo photo-placeholder ${s.photoShape === 'round' ? 'round' : ''}"><span>Photo</span><small>3 : 4</small></div>`}</header>`;
  return `<main class="cv">${header}${doc.sections.map((section) => `<section class="cv-section">${section.title !== null ? `<div class="section-title">${md(section.title)}</div>` : ''}${section.blocks.map((b) => (b.type === 'row' ? `<div class="cv-row">${b.left !== null ? `<div class="row-left">${md(b.left)}</div>` : ''}${b.right !== null ? `<div class="row-right">${md(b.right)}</div>` : ''}</div>` : b.type === 'break' ? '<div class="page-break"></div>' : `<div class="cv-text">${md(b.text)}</div>`)).join('')}</section>`).join('')}</main>`;
}
function designCss() {
  const s = doc.settings;
  const font =
    s.font === 'sans'
      ? '"Noto Sans SC Variable","Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif'
      : '"Noto Serif SC Variable","Noto Serif CJK SC","Songti SC","SimSun",serif';
  return `@page{size:A4;margin:${s.margin}mm}.cv{--resume-bold-weight:${s.boldWeight};font-family:${font};font-size:${s.fontSize}px;line-height:${s.lineHeight}}.cv-name{font-size:${s.nameSize}px;color:${s.accent}}.section-title{font-size:${s.titleSize}px!important;color:${s.accent};border-color:${s.accent}}.cv-section{margin-bottom:${s.sectionGap}px}.cv p{margin-bottom:${s.paragraphGap}px}.cv p:last-child{margin-bottom:0}.cv-text{margin-bottom:${s.paragraphGap}px}.cv li{margin-top:${s.listGap}px;margin-bottom:${s.listGap}px}.cv-header{--photo-width:${s.photoWidth}mm;grid-template-columns:minmax(0,1fr) var(--photo-width);margin-bottom:${s.headerGap}px}.cv-header.photo-left{grid-template-columns:var(--photo-width) minmax(0,1fr)}.cv-photo{width:var(--photo-width);height:var(--photo-height,auto)}`;
}
function schedulePreview(delay = 450) {
  clearTimeout(previewTimer);
  $('export').disabled = true;
  previewTimer = setTimeout(renderPreview, delay);
}
function renderPreview() {
  const rev = ++revision,
    base = new URL('./', location.href).href,
    html = resumeMarkup(),
    css = designCss();
  $('page-count').textContent = 'Preparing…';
  const script = `(async()=>{try{await (${prepareResumeFonts.toString()})(document.getElementById('source'),${JSON.stringify(doc.settings)});await (${fitHeaderPhoto.toString()})(document.getElementById('source'),${JSON.stringify(doc.settings)});await document.fonts.ready;const previewer=new Paged.Previewer();const flow=await previewer.preview(document.getElementById('source').innerHTML,[${JSON.stringify(base + 'resume.css')},{'resume-dynamic.css':${JSON.stringify(css)}}],document.getElementById('pages'));await document.fonts.ready;parent.postMessage({type:'resume-preview-ready',revision:${rev},pages:flow.total,height:document.getElementById('pages').scrollHeight},${JSON.stringify(location.origin)});}catch(error){parent.postMessage({type:'resume-preview-error',revision:${rev},message:String(error)},${JSON.stringify(location.origin)});}})();`;
  $('preview').srcdoc =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="${esc(base)}"><title>${esc(filename())}</title><link rel="stylesheet" href="vendor/katex.min.css"><link rel="stylesheet" href="vendor/resume-fonts.css"><link rel="stylesheet" href="resume.css"><style>${css}</style><style>html,body{margin:0;background:transparent}body{width:794px}.pagedjs_page{background:white;margin:0 0 18px;box-shadow:0 3px 14px #20372814}.pagedjs_page:last-child{margin-bottom:0}@media print{html,body{width:auto;background:white}.pagedjs_page{margin:0!important;box-shadow:none!important;break-after:page}.pagedjs_page:last-child{break-after:auto}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}</style><script>window.PagedConfig={auto:false};<\/script><script src="vendor/paged.polyfill.js"><\/script></head><body><template id="source">${html}</template><div id="pages"></div><script>${script}<\/script></body></html>`;
}
window.addEventListener('message', (event) => {
  if (event.source !== $('preview').contentWindow) return;
  const data = event.data;
  if (!data || data.revision !== revision) return;
  if (data.type === 'resume-preview-ready') {
    previewHeight = data.height;
    readyRevision = data.revision;
    $('page-count').textContent = `${data.pages} ${data.pages === 1 ? 'page' : 'pages'}`;
    $('export').disabled = false;
    fitPreview();
  } else if (data.type === 'resume-preview-error') {
    $('page-count').textContent = 'Preview unavailable';
    toast('Preview failed. Try simplifying the content or reload. Your draft has been kept.');
    console.error(data.message);
  }
});
function fitPreview() {
  const viewport = $('preview-scroll'),
    available = Math.max(270, viewport.clientWidth - (window.innerWidth < 760 ? 24 : 56)),
    scale = $('zoom').value === 'fit' ? Math.min(1, available / 794) : Number($('zoom').value);
  $('preview').style.height = previewHeight + 'px';
  $('preview').style.transform = `scale(${scale})`;
  $('preview-sized').style.width = 794 * scale + 'px';
  $('preview-sized').style.height = previewHeight * scale + 'px';
}
$('zoom').addEventListener('change', fitPreview);
new ResizeObserver(fitPreview).observe($('preview-scroll'));
$('export').addEventListener('click', () => {
  if (readyRevision !== revision) return;
  persist();
  $('pdf-dialog').showModal();
});
$('print-now').addEventListener('click', () => {
  $('pdf-dialog').close();
  document.title = filename();
  $('preview').contentWindow.focus();
  $('preview').contentWindow.print();
});
$('download-pdf').addEventListener('click', async () => {
  const button = $('download-pdf');
  button.disabled = true;
  $('print-now').disabled = true;
  const before = button.textContent;
  let releaseFonts = () => {};
  let exportFrame;
  try {
    exportFrame = await createExportFrame($('preview').contentDocument);
    const frame = exportFrame.contentDocument;
    releaseFonts = sharePreviewFonts(frame);
    const pages = Array.from(frame.querySelectorAll('.pagedjs_page'));
    if (!pages.length) throw Error('The preview is not ready yet.');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    pdf.setProperties({ title: doc.name, creator: 'Auto Resume' });
    for (let i = 0; i < pages.length; i++) {
      button.textContent = `Generating ${i + 1} / ${pages.length} pages…`;
      const page = pages[i],
        canvas = await html2canvas(page, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: false,
          windowWidth: 794,
        });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
      const box = page.getBoundingClientRect();
      for (const link of page.querySelectorAll('a[href]')) {
        const href = link.getAttribute('href');
        if (!/^(https?:|mailto:)/i.test(href)) continue;
        for (const r of link.getClientRects())
          pdf.link(
            ((r.left - box.left) / box.width) * 210,
            ((r.top - box.top) / box.height) * 297,
            (r.width / box.width) * 210,
            (r.height / box.height) * 297,
            { url: href },
          );
      }
    }
    download(pdf.output('arraybuffer'), filename() + '.pdf', 'application/pdf');
    $('pdf-dialog').close();
    toast('PDF downloaded. Use the text version when selectable text is needed.');
  } catch (error) {
    toast('Download failed: ' + error.message + '. Try exporting a text PDF instead.');
    console.error(error);
  } finally {
    releaseFonts();
    exportFrame?.remove();
    button.disabled = false;
    button.textContent = before;
    $('print-now').disabled = false;
  }
});
const handle = document.querySelector('.resize-handle');
handle.addEventListener('pointerdown', (event) => {
  handle.setPointerCapture(event.pointerId);
  document.body.style.userSelect = 'none';
  const moving = (e) => {
    const percent = Math.max(30, Math.min(65, (e.clientX / window.innerWidth) * 100));
    document.documentElement.style.setProperty('--editor-width', percent + '%');
  };
  const stop = () => {
    document.body.style.userSelect = '';
    handle.removeEventListener('pointermove', moving);
    handle.removeEventListener('pointerup', stop);
  };
  handle.addEventListener('pointermove', moving);
  handle.addEventListener('pointerup', stop);
});
renderAll();
if (storedError) status('Could not read the saved draft. Import a backup to restore it.', true);
else status('Drafts stay in this browser');
