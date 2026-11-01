// Return one text edit and the selection to keep after toggling inline Markdown.
export function toggleInlineFormat(value, start, end, marker, fallback) {
  const size = marker.length;
  const unwrap = (from, to) => {
    const replacement = value.slice(from + size, to - size);
    const position = (offset) => Math.max(from, Math.min(from + replacement.length, offset - size));
    return {
      from,
      to,
      replacement,
      selectionStart: position(start),
      selectionEnd: position(end),
    };
  };
  // The selection retained by a previous toggle excludes its surrounding markers.
  if (
    start >= size &&
    value.slice(start - size, start) === marker &&
    value.slice(end, end + size) === marker
  )
    return unwrap(start - size, end + size);

  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const spans = new RegExp(`${escaped}(?=\\S)([\\s\\S]*?\\S)${escaped}`, 'g');
  for (const match of value.matchAll(spans)) {
    const from = match.index,
      to = from + match[0].length;
    if (
      !match[1].includes('\n\n') &&
      ((start >= from + size && end <= to - size) || (start === from && end === to))
    )
      return unwrap(from, to);
  }

  // Markdown delimiters must touch content; leave surrounding whitespace outside.
  const selected = value.slice(start, end);
  const leading = selected.match(/^\s*/)[0];
  const trailing = selected.trim() ? selected.match(/\s*$/)[0] : '';
  const content = selected.trim() || fallback;
  const selectionStart = start + leading.length + size;
  return {
    from: start,
    to: end,
    replacement: leading + marker + content + marker + trailing,
    selectionStart,
    selectionEnd: selectionStart + content.length,
  };
}
