import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleInlineFormat } from '../src/inline-format.js';
import { renderMarkdown } from '../src/markdown.js';

function apply(value, start, end, marker) {
  const edit = toggleInlineFormat(value, start, end, marker, 'Text');
  return {
    value: value.slice(0, edit.from) + edit.replacement + value.slice(edit.to),
    start: edit.selectionStart,
    end: edit.selectionEnd,
  };
}

for (const [marker, tag] of [
  ['**', 'strong'],
  ['++', 'ins'],
]) {
  test(`${tag} toggles preserve surrounding content, whitespace, Unicode and selection`, () => {
    for (const selected of ['中文 AI 🙂', '  中文 AI 🙂  ', '*italic*', 'First\nSecond']) {
      const original = `Before ${selected} after`;
      const once = apply(original, 7, 7 + selected.length, marker);
      assert.ok(renderMarkdown(once.value).includes(`<${tag}>`));
      assert.equal(once.value.slice(once.start, once.end), selected.trim());
      const twice = apply(once.value, once.start, once.end, marker);
      assert.equal(twice.value, original);
      assert.equal(twice.value.slice(twice.start, twice.end), selected.trim());
    }
  });
  test(`${tag} removes an existing span without affecting adjacent formatted spans`, () => {
    const original = `${marker}First${marker} and ${marker}Second${marker}`;
    const whole = apply(original, 0, 5 + marker.length * 2, marker);
    assert.equal(whole.value, `First and ${marker}Second${marker}`);
    assert.equal(whole.value.slice(whole.start, whole.end), 'First');
    const caret = apply(original, 4, 4, marker);
    assert.equal(caret.value, whole.value);
    assert.equal(caret.start, 2);
    assert.equal(caret.end, 2);
  });
}

test('bold and underline can be toggled independently on the same selected text', () => {
  let state = apply('Selected text', 0, 13, '**');
  state = apply(state.value, state.start, state.end, '++');
  assert.match(renderMarkdown(state.value), /<strong><ins>Selected text<\/ins><\/strong>/);
  state = apply(state.value, state.start, state.end, '**');
  assert.equal(state.value, '++Selected text++');
  state = apply(state.value, state.start, state.end, '++');
  assert.equal(state.value, 'Selected text');
});
