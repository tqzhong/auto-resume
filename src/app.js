import DOMPurify from 'dompurify';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { renderMarkdown } from './markdown.js';
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
      `已保存到当前浏览器 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
    );
  } catch {
    persisted = false;
    status('浏览器存储已满或不可用，请下载备份', true);
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
  status('正在保存…');
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
  toast('已撤销，可重做');
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
    ? `<div class="format-bar" aria-label="${esc(label)}格式工具">${[
        ['B', 'bold', '加粗'],
        ['I', 'italic', '斜体'],
        ['U', 'underline', '下划线'],
        ['高亮', 'highlight', '高亮'],
        ['链接', 'link', '超链接'],
        ['• 列表', 'bullet', '无序列表'],
        ['1. 列表', 'number', '有序列表'],
        ['公式', 'math', '公式'],
      ]
        .map(
          ([caption, format, title]) =>
            `<button type="button" data-format="${format}" data-for="${fieldId}" title="${title}">${caption}</button>`,
        )
        .join('')}</div>`
    : '';
  return `<label class="field" for="${fieldId}"><span class="field-label"><span>${label}</span>${remove ? `<button type="button" aria-label="删除${esc(label)}" data-action="remove-field" data-target="${target}" data-id="${id}" data-key="${key}" class="field-remove">×</button>` : ''}</span>${tools}<textarea id="${fieldId}" data-target="${target}" data-id="${id}" data-key="${key}" aria-label="${esc(label)}" rows="${rows}" class="${rich ? 'markdown-editor' : 'small'}" spellcheck="false">${esc(value)}</textarea></label>`;
}
function renderHeader() {
  return `<details class="edit-module" data-module="header" ${openModules.has('header') ? 'open' : ''}><summary class="module-summary"><span class="module-name">基本信息与照片</span><span class="count">页眉</span></summary><div class="module-content"><div class="photo-editor"><div class="photo-thumb">${doc.header.photo ? `<img src="${doc.header.photo}" alt="当前简历照片">` : '3 : 4 照片'}</div><div class="photo-buttons"><label class="button" for="photo-file">${doc.header.photo ? '更换照片' : '添加照片'}<input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp" class="sr-only"></label>${action(doc.header.photoHidden ? '恢复照片位' : '移除照片位', 'toggle-photo')}${doc.header.photo ? action('删除照片', 'delete-photo') : ''}<p>JPG / PNG / WebP · 照片随备份保存</p></div></div>${doc.header.fields.map((f) => field({ label: f.kind === 'name' ? '姓名 / 主标题' : f.kind === 'contact' ? '联系方式' : '求职方向 / 补充信息', value: f.text, target: 'header', id: f.id, key: 'text', rows: f.kind === 'contact' ? 2 : 1 })).join('')}<div class="add-blocks">${action('＋ 主标题', 'add-header', { kind: 'name' })}${action('＋ 信息区域', 'add-header', { kind: 'text' })}${action('＋ 联系方式', 'add-header', { kind: 'contact' })}</div></div></details>`;
}
function renderBlock(b, s, index) {
  const controls = `<div class="block-actions">${action('↑', 'move-block', { section: s.id, id: b.id, dir: -1 })}${action('↓', 'move-block', { section: s.id, id: b.id, dir: 1 })}${action('删除', 'delete-block', { section: s.id, id: b.id }, 'danger')}</div>`;
  let content = '';
  if (b.type === 'row')
    content = `<div class="row-fields">${b.left !== null ? field({ label: '左侧信息', value: b.left, target: 'block', id: b.id, key: 'left' }) : `<div class="field">${action('＋ 左侧信息', 'restore-field', { id: b.id, key: 'left' }, 'compact-btn')}</div>`}${b.right !== null ? field({ label: '右侧时间 / 信息', value: b.right, target: 'block', id: b.id, key: 'right' }) : `<div class="field">${action('＋ 右侧信息', 'restore-field', { id: b.id, key: 'right' }, 'compact-btn')}</div>`}</div>`;
  else if (b.type === 'text')
    content = field({
      label: '整块正文 · Markdown',
      value: b.text,
      target: 'block',
      id: b.id,
      key: 'text',
      rows: 7,
      remove: false,
      rich: true,
    });
  else content = '<p class="muted">后面的内容从新的一页开始。可以移动这条分页线。</p>';
  return `<div class="block-editor" data-block="${b.id}"><div class="block-head"><span>${String(index + 1).padStart(2, '0')} · ${b.type === 'row' ? '左右信息行' : b.type === 'text' ? '正文区域' : '手动分页'}</span>${controls}</div>${content}</div>`;
}
function renderSection(s) {
  return `<details class="edit-module" data-module="${s.id}" ${openModules.has(s.id) ? 'open' : ''}><summary class="module-summary"><span class="module-name">${esc(s.title?.replace(/[*_~+=#]/g, '') || '无标题模块')}</span><span class="count">${s.blocks.length} 个区域</span></summary><div class="module-content"><div class="module-actions">${action('↑ 上移', 'move-section', { id: s.id, dir: -1 })}${action('↓ 下移', 'move-section', { id: s.id, dir: 1 })}${action('复制模块', 'duplicate-section', { id: s.id })}${action('删除整个模块', 'delete-section', { id: s.id }, 'danger')}</div>${s.title !== null ? field({ label: '模块标题', value: s.title, target: 'section', id: s.id, key: 'title' }) : `<div class="empty">模块标题已删除。 ${action('恢复标题', 'restore-title', { id: s.id }, 'compact-btn')}</div>`}${s.blocks.map((b, i) => renderBlock(b, s, i)).join('')}${!s.blocks.length ? '<div class="empty">这个模块暂时没有内容，添加一个正文区域开始写。</div>' : ''}<div class="add-blocks">${action('＋ 左右信息行', 'add-block', { section: s.id, type: 'row' })}${action('＋ 正文区域', 'add-block', { section: s.id, type: 'text' })}${action('＋ 分页', 'add-block', { section: s.id, type: 'break' })}</div></div></details>`;
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
  $('design-content').innerHTML = `<div class="setting-group"><h2>字体与颜色</h2>${select(
    'font',
    '中文字体',
    [
      ['serif', '宋体 / 衬线'],
      ['sans', '黑体 / 无衬线'],
    ],
  )}<label class="settings-row">标题强调色<input type="color" data-setting="accent" aria-label="标题强调色" value="${doc.settings.accent}"></label>${slider('fontSize', '全局正文字号', 10, 20, 0.5, ' px')}${slider('titleSize', '模块标题字号', 15, 28, 0.5, ' px')}${slider('nameSize', '姓名字号', 24, 46, 1, ' px')}</div><div class="setting-group"><h2>行距与留白</h2>${slider('lineHeight', '全局行距', 1.15, 2.2, 0.05, ' 倍')}${slider('paragraphGap', '段落间距', 0, 16, 1, ' px')}${slider('listGap', '列表行间距', 0, 12, 1, ' px')}${slider('sectionGap', '模块间距', 4, 32, 1, ' px')}${slider('margin', '页面边距', 8, 24, 0.5, ' mm')}</div><div class="setting-group"><h2>照片</h2>${select(
    'photoSide',
    '照片位置',
    [
      ['right', '右侧'],
      ['left', '左侧'],
    ],
  )}${select('photoShape', '照片形状', [
    ['square', '3 : 4 矩形'],
    ['round', '圆形'],
  ])}${slider('photoWidth', '照片宽度', 20, 40, 1, ' mm')}<p class="muted">照片默认居中裁切。可在「内容」中更换照片或删除照片位。</p></div><button id="reset-design">恢复默认排版</button>`;
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
        text: button.dataset.kind === 'name' ? '你的姓名' : '填写信息',
      });
      openModules.add('header');
    }
    if (a === 'remove-field') {
      if (button.dataset.target === 'header')
        doc.header.fields = doc.header.fields.filter((f) => f.id !== id);
      else if (button.dataset.target === 'section') s.title = null;
      else if (b) b[key] = null;
    }
    if (a === 'restore-field' && b) b[key] = key === 'left' ? '左侧信息' : '时间';
    if (a === 'restore-title') s.title = '模块标题';
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
    toast('已删除，点击顶部「撤销」可恢复');
}
function applyFormat(button) {
  const area = $(button.dataset.for),
    start = area.selectionStart,
    end = area.selectionEnd,
    selected = area.value.slice(start, end),
    format = button.dataset.format;
  const wraps = {
    bold: ['**', '**', '重点文字'],
    italic: ['*', '*', '斜体'],
    underline: ['++', '++', '下划线'],
    highlight: ['==', '==', '高亮'],
    link: ['[', '](https://example.com)', '链接文字'],
    math: ['$', '$', 'F_1=\\frac{2PR}{P+R}'],
  };
  let replacement;
  if (format === 'bullet' || format === 'number') {
    replacement = (selected || '条目')
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
          el.value.replace(/[*_~+=#]/g, '') || '无标题模块';
      }
      changed();
    }
  }
  if (el.dataset.setting) {
    doc.settings[el.dataset.setting] = el.type === 'range' ? Number(el.value) : el.value;
    if ($('out-' + el.dataset.setting))
      $('out-' + el.dataset.setting).textContent = el.value + (el.dataset.unit || '');
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
  if (persist()) toast('已保存。关闭后用同一浏览器、同一网址打开即可继续。');
  else toast('本地保存失败，请点击「备份」下载文件。');
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
  return (doc.name || '我的简历').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
}
$('backup').addEventListener('click', () => {
  persist();
  download(
    JSON.stringify({ ...doc, exportedAt: new Date().toISOString() }, null, 2),
    filename() + '.resume.json',
    'application/json',
  );
  toast('已下载备份文件，包含全部内容、排版和照片');
});
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 6 * 1024 * 1024) throw Error('备份文件过大，请使用 6 MB 以内的 JSON 文件。');
    const next = normalizeDocument(JSON.parse(await file.text()));
    mutate(() => {
      doc = next;
      doc.sections.slice(0, 2).forEach((s) => openModules.add(s.id));
    });
    renderDesign();
    persist();
    toast('备份已导入；如需返回之前的草稿，点击「撤销」');
  } catch (error) {
    toast('导入失败：' + error.message);
  }
  e.target.value = '';
});
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'photo-file') return;
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw Error('请选择 JPG、PNG 或 WebP 图片');
    if (file.size > 15 * 1024 * 1024) throw Error('照片请小于 15 MB');
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
      toast('照片已添加，会随草稿与备份一起保存');
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
    toast('已保存到当前浏览器');
  }
  if (event.key.toLowerCase() === 'z' && !event.target.matches('textarea,input')) {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  }
});

function resumeMarkup() {
  const s = doc.settings,
    header = `<header class="cv-header ${doc.header.photoHidden ? 'without-photo' : ''} ${s.photoSide === 'left' ? 'photo-left' : ''}"><div class="header-fields">${doc.header.fields.map((f) => `<div class="${f.kind === 'name' ? 'cv-name' : f.kind === 'contact' ? 'cv-contact' : 'cv-headline'}">${md(f.text)}</div>`).join('')}</div>${doc.header.photoHidden ? '' : doc.header.photo ? `<img class="cv-photo ${s.photoShape === 'round' ? 'round' : ''}" src="${doc.header.photo}" alt="个人照片">` : `<div class="cv-photo photo-placeholder ${s.photoShape === 'round' ? 'round' : ''}"><span>照片位置</span><small>3 : 4</small></div>`}</header>`;
  return `<main class="cv">${header}${doc.sections.map((section) => `<section class="cv-section">${section.title !== null ? `<div class="section-title">${md(section.title)}</div>` : ''}${section.blocks.map((b) => (b.type === 'row' ? `<div class="cv-row">${b.left !== null ? `<div class="row-left">${md(b.left)}</div>` : ''}${b.right !== null ? `<div class="row-right">${md(b.right)}</div>` : ''}</div>` : b.type === 'break' ? '<div class="page-break"></div>' : `<div class="cv-text">${md(b.text)}</div>`)).join('')}</section>`).join('')}</main>`;
}
function designCss() {
  const s = doc.settings;
  const font =
    s.font === 'sans'
      ? '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif'
      : '"Songti SC","STSong","Noto Serif CJK SC","SimSun",serif';
  return `@page{size:A4;margin:${s.margin}mm}.cv{font-family:${font};font-size:${s.fontSize}px;line-height:${s.lineHeight}}.cv-name{font-size:${s.nameSize}px;color:${s.accent}}.section-title{font-size:${s.titleSize}px!important;color:${s.accent};border-color:${s.accent}}.cv-section{margin-bottom:${s.sectionGap}px}.cv p{margin-bottom:${s.paragraphGap}px}.cv p:last-child{margin-bottom:0}.cv-text{margin-bottom:${s.paragraphGap}px}.cv li{margin-top:${s.listGap}px;margin-bottom:${s.listGap}px}.cv-header{grid-template-columns:minmax(0,1fr) ${s.photoWidth}mm}.cv-header.photo-left{grid-template-columns:${s.photoWidth}mm minmax(0,1fr)}.cv-photo{width:${s.photoWidth}mm}`;
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
  $('page-count').textContent = '排版中…';
  const script = `(async()=>{try{await document.fonts.ready;const previewer=new Paged.Previewer();const flow=await previewer.preview(document.getElementById('source').innerHTML,[${JSON.stringify(base + 'resume.css')},{'resume-dynamic.css':${JSON.stringify(css)}}],document.getElementById('pages'));await document.fonts.ready;parent.postMessage({type:'resume-preview-ready',revision:${rev},pages:flow.total,height:document.getElementById('pages').scrollHeight},${JSON.stringify(location.origin)});}catch(error){parent.postMessage({type:'resume-preview-error',revision:${rev},message:String(error)},${JSON.stringify(location.origin)});}})();`;
  $('preview').srcdoc =
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><base href="${esc(base)}"><title>${esc(filename())}</title><link rel="stylesheet" href="vendor/katex.min.css"><style>html,body{margin:0;background:transparent}body{width:794px}.pagedjs_page{background:white;margin:0 0 18px;box-shadow:0 3px 14px #20372814}.pagedjs_page:last-child{margin-bottom:0}@media print{html,body{width:auto;background:white}.pagedjs_page{margin:0!important;box-shadow:none!important;break-after:page}.pagedjs_page:last-child{break-after:auto}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}</style><script>window.PagedConfig={auto:false};<\/script><script src="vendor/paged.polyfill.js"><\/script></head><body><template id="source">${html}</template><div id="pages"></div><script>${script}<\/script></body></html>`;
}
window.addEventListener('message', (event) => {
  if (event.source !== $('preview').contentWindow) return;
  const data = event.data;
  if (!data || data.revision !== revision) return;
  if (data.type === 'resume-preview-ready') {
    previewHeight = data.height;
    readyRevision = data.revision;
    $('page-count').textContent = `${data.pages} 页`;
    $('export').disabled = false;
    fitPreview();
  } else if (data.type === 'resume-preview-error') {
    $('page-count').textContent = '排版失败';
    toast('预览排版失败，请尝试缩短异常内容或重新加载。草稿仍已保留。');
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
  try {
    const frame = $('preview').contentDocument;
    await frame.fonts.ready;
    const pages = Array.from(frame.querySelectorAll('.pagedjs_page'));
    if (!pages.length) throw Error('预览还没有准备好');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    pdf.setProperties({ title: doc.name, creator: '简历工坊' });
    for (let i = 0; i < pages.length; i++) {
      button.textContent = `正在生成 ${i + 1} / ${pages.length} 页…`;
      const page = pages[i],
        canvas = await html2canvas(page, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: false,
          windowWidth: 794,
        });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, 210, 297);
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
    toast('PDF 已下载。投递招聘系统时，推荐使用文字版 PDF。');
  } catch (error) {
    toast('直接下载未成功：' + error.message + '。可使用文字版 PDF 导出。');
    console.error(error);
  } finally {
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
if (storedError) status('未能读取旧草稿，可导入备份恢复', true);
else status('草稿保存在当前浏览器');
