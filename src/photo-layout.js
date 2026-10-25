// Runs inside the preview iframe before pagination. Keep this function self-contained:
// the editor serializes it into the iframe, whose styles match the exported pages.
export async function fitHeaderPhoto(source, settings) {
  const header = source.content.querySelector('.cv-header');
  if (!header || header.classList.contains('without-photo') || settings.photoSizing !== 'auto')
    return;

  const pxPerMm = 96 / 25.4;
  const minimum = settings.photoMinHeight * pxPerMm;
  const ratio = settings.photoShape === 'round' ? 1 : 3 / 4;
  const measure = document.createElement('div');
  measure.className = 'cv';
  measure.setAttribute('aria-hidden', 'true');
  measure.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;width:${(210 - settings.margin * 2) * pxPerMm}px`;
  const copy = header.cloneNode(true);
  measure.append(copy);
  document.body.append(measure);
  try {
    await document.fonts.ready;
    // Keep unusually long headers from letting the photo consume the text column.
    const maximum = Math.max(minimum, (measure.getBoundingClientRect().width * 0.4) / ratio);
    let height = minimum;
    const size = (element, value) => {
      element.style.setProperty('--photo-width', `${value * ratio}px`);
      element.style.setProperty('--photo-height', `${value}px`);
    };
    // Photo width affects wrapping, so start small and settle before paginating.
    for (let pass = 0; pass < 12; pass++) {
      size(copy, height);
      const textHeight = copy.querySelector('.header-fields').getBoundingClientRect().height;
      const next = Math.min(maximum, Math.max(minimum, textHeight));
      if (Math.abs(next - height) < 0.25) break;
      height = next;
    }
    size(header, height);
  } finally {
    measure.remove();
  }
}
