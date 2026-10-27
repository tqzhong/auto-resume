// Serialized into the preview iframe. Load the actual body glyphs and weights
// before measuring the header or paginating; an inert <template> loads no fonts.
export async function prepareResumeFonts(source, settings) {
  const sample = document.createElement('div');
  sample.setAttribute('aria-hidden', 'true');
  sample.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;width:${210 - settings.margin * 2}mm`;
  sample.append(source.content.cloneNode(true));
  document.body.append(sample);
  try {
    sample.getBoundingClientRect();
    await document.fonts.ready;
    if (Array.from(document.fonts).some((font) => font.status === 'error')) {
      throw new Error('A resume font could not load. Please reload and try again.');
    }
  } finally {
    sample.remove();
  }
}

// html2canvas creates its canvas and font-metric probes in the editor document,
// not the preview iframe. Share loaded faces (including math) for this export.
export function sharePreviewFonts(previewDocument, targetDocument = document) {
  const added = [];
  for (const face of previewDocument.fonts) {
    if (face.status === 'loaded' && !targetDocument.fonts.has(face)) {
      targetDocument.fonts.add(face);
      added.push(face);
    }
  }
  return () => added.forEach((face) => targetDocument.fonts.delete(face));
}

// The visible preview is scaled to fit the editor. Export an unscaled copy so
// canvas range measurements are not affected by an ancestor CSS transform.
export async function createExportFrame(previewDocument) {
  const html = previewDocument.documentElement.cloneNode(true);
  const originalStyles = previewDocument.querySelectorAll('style');
  html.querySelectorAll('style').forEach((style, index) => {
    const sheet = originalStyles[index].sheet;
    if (sheet) style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n');
  });
  html.querySelectorAll('script, template').forEach((node) => node.remove());
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:794px;height:${previewDocument.documentElement.scrollHeight}px;border:0;visibility:hidden`;
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  frame.srcdoc = '<!doctype html>' + html.outerHTML;
  document.body.append(frame);
  try {
    await loaded;
    await frame.contentDocument.fonts.ready;
    return frame;
  } catch (error) {
    frame.remove();
    throw error;
  }
}
