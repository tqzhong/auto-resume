import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDocument, normalizeDocument, move, clone } from '../src/model.js';
import { renderMarkdown } from '../src/markdown.js';
test('backup roundtrip preserves deleted fields, Unicode, photo, markdown and styling', () => {
  const d = initialDocument();
  d.sections[1].title = null;
  d.sections[1].blocks[0].right = null;
  d.header.photo = 'data:image/jpeg;base64,YWJj';
  d.settings.lineHeight = 1.8;
  d.settings.headerGap = 0;
  d.settings.photoSizing = 'fixed';
  d.settings.photoMinHeight = 32;
  d.sections[1].blocks[1].text = '**中文**\n\n- 项目一\n- 项目二';
  assert.deepEqual(normalizeDocument(JSON.parse(JSON.stringify(d))), {
    ...d,
    header: { ...d.header, photoHidden: false },
  });
});
test('existing version 1 drafts retain their layout when header spacing is absent', () => {
  const legacy = initialDocument();
  delete legacy.settings.headerGap;
  legacy.settings.sectionGap = 9;
  const restored = normalizeDocument(JSON.parse(JSON.stringify(legacy)));
  assert.equal(restored.settings.headerGap, 23);
  assert.equal(restored.settings.sectionGap, 9);
  assert.deepEqual(restored.header.fields, legacy.header.fields);
  assert.deepEqual(restored.sections, legacy.sections);
});
test('import rejects wrong schema/version and clamps layout values', () => {
  assert.throws(() => normalizeDocument({ version: 1 }));
  const d = initialDocument();
  d.version = 2;
  assert.throws(() => normalizeDocument(d));
  d.version = 1;
  d.settings.fontSize = 500;
  d.settings.photoMinHeight = 0;
  d.settings.photoSizing = 'unknown';
  d.settings.accent = 'url(https://bad.test)';
  d.header.photo = 'https://example.com/secret.jpg';
  const n = normalizeDocument(d);
  assert.equal(n.settings.fontSize, 20);
  assert.equal(n.settings.photoMinHeight, 20);
  assert.equal(n.settings.photoSizing, 'auto');
  assert.equal(n.settings.accent, '#353387');
  assert.equal(n.header.photo, null);
});
test('older backups gain adaptive photo sizing without changing content or fixed width', () => {
  const legacy = initialDocument();
  delete legacy.settings.photoSizing;
  delete legacy.settings.photoMinHeight;
  legacy.settings.photoWidth = 35;
  const restored = normalizeDocument(legacy);
  assert.equal(restored.settings.photoSizing, 'auto');
  assert.equal(restored.settings.photoMinHeight, 28);
  assert.equal(restored.settings.photoWidth, 35);
  assert.deepEqual(restored.header.fields, legacy.header.fields);
  assert.deepEqual(restored.sections, legacy.sections);
});
test('ordering keeps boundary items and correctly moves modules', () => {
  const d = initialDocument(),
    old = clone(d.sections);
  move(d.sections, d.sections[0].id, -1);
  assert.deepEqual(d.sections, old);
  move(d.sections, old[1].id, -1);
  assert.equal(d.sections[0].id, old[1].id);
});
test('required Markdown and math render in one continuous body', () => {
  const html = renderMarkdown(
    '**加粗** *斜体* ++下划线++ ==高亮== [项目](https://example.com) $F_1=\\frac{2PR}{P+R}$\n\n- 无序\n- 第二条\n\n1. 有序\n2. 第二条',
  );
  for (const needle of [
    '<strong>',
    '<em>',
    '<ins>',
    '<mark>',
    'href="https://example.com"',
    'katex',
    '<ul>',
    '<ol>',
  ])
    assert.ok(html.includes(needle), needle);
});
test('raw HTML and unsafe links cannot execute or load remote images', () => {
  const html = renderMarkdown(
    '<script>alert(1)</script> [bad](javascript:alert(1)) ![pic](https://example.com/track.png)',
  );
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('<img'));
});
