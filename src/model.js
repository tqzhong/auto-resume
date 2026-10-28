export const STORAGE_KEY = 'resume-studio-document-v1';
export const uid = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const defaults = {
  font: 'serif',
  fontSize: 14,
  boldWeight: 800,
  lineHeight: 1.65,
  titleSize: 20,
  nameSize: 34,
  margin: 14,
  headerGap: 23,
  sectionGap: 18,
  paragraphGap: 6,
  listGap: 3,
  accent: '#353387',
  nameColor: '#353387',
  sectionTitleColor: '#353387',
  photoWidth: 29,
  photoSizing: 'auto',
  photoMinHeight: 28,
  photoSide: 'right',
  photoShape: 'square',
};
export function block(type = 'text') {
  if (type === 'row')
    return { id: uid(), type, left: 'Company / project · Role', right: '2022 — Present' };
  if (type === 'break') return { id: uid(), type };
  return {
    id: uid(),
    type: 'text',
    text: 'Write here. Use **bold**, *italic*, ==highlight==, and ++underline++.\n\n- Describe your work and its impact\n- Add specific, verifiable outcomes',
  };
}
export function section(title = 'New section') {
  return { id: uid(), title, blocks: [block('row'), block('text')] };
}
// Fictional sample content used in the editor and documentation.
export function initialDocument() {
  return {
    schema: 'resume-studio',
    version: 1,
    name: 'Alex Morgan — Resume',
    settings: { ...defaults },
    header: {
      photo: null,
      fields: [
        { id: uid(), kind: 'name', text: 'Alex Morgan' },
        { id: uid(), kind: 'text', text: 'Product Designer' },
        {
          id: uid(),
          kind: 'contact',
          text: 'London · alex@example.com\n[Portfolio](https://example.com) · [LinkedIn](https://www.linkedin.com)',
        },
      ],
    },
    sections: [
      {
        id: uid(),
        title: 'Profile',
        blocks: [
          {
            id: uid(),
            type: 'text',
            text: 'I turn complex problems into clear, useful digital experiences. My work connects thoughtful design with practical outcomes.',
          },
        ],
      },
      {
        id: uid(),
        title: 'Experience',
        blocks: [
          {
            id: uid(),
            type: 'row',
            left: '**Northstar Studio · Senior Designer**',
            right: '2022 — Present',
          },
          {
            id: uid(),
            type: 'text',
            text: '*Digital products & services*\n\n- **Led product design** for a shared workspace, from discovery to launch.\n- **Simplified everyday workflows** through research, prototyping, and close collaboration with engineering.',
          },
        ],
      },
      {
        id: uid(),
        title: 'Selected Work',
        blocks: [
          { id: uid(), type: 'row', left: '**Atlas — A calmer workspace**', right: '2024 — 2025' },
          {
            id: uid(),
            type: 'text',
            text: '*Research · Prototyping · Design systems*\n\n- Turned customer insights into a focused, intuitive workspace for distributed teams.\n- Built a reusable component library to bring consistency across the product.',
          },
        ],
      },
      {
        id: uid(),
        title: 'Skills',
        blocks: [
          {
            id: uid(),
            type: 'text',
            text: '**Design:** Product strategy, interaction design, prototyping\n**Tools:** Figma, Framer, Notion\n**Practice:** Research, accessibility, design systems',
          },
        ],
      },
      {
        id: uid(),
        title: 'Education',
        blocks: [
          {
            id: uid(),
            type: 'row',
            left: '**Northbridge University · BA Design**',
            right: '2016 — 2020',
          },
        ],
      },
    ],
  };
}
const text = (value, fallback = '') =>
  typeof value === 'string' ? value.slice(0, 100000) : fallback;
const nullable = (value) => (value === null ? null : text(value));
const id = (value) => (typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : uid());
const clamp = (value, lo, hi, fallback) =>
  Number.isFinite(Number(value)) ? Math.max(lo, Math.min(hi, Number(value))) : fallback;
export function normalizeDocument(input) {
  if (
    !input ||
    input.schema !== 'resume-studio' ||
    input.version !== 1 ||
    !Array.isArray(input.sections) ||
    !input.header ||
    !Array.isArray(input.header.fields)
  )
    throw new Error('This is not a valid resume backup, or its version is unsupported.');
  const settings = { ...defaults },
    raw = input.settings || {};
  const bounds = {
    fontSize: [10, 20],
    boldWeight: [700, 900],
    lineHeight: [1.15, 2.2],
    titleSize: [15, 28],
    nameSize: [24, 46],
    margin: [8, 24],
    headerGap: [0, 60],
    sectionGap: [4, 32],
    paragraphGap: [0, 16],
    listGap: [0, 12],
    photoWidth: [20, 40],
    photoMinHeight: [20, 40],
  };
  for (const [key, [lo, hi]] of Object.entries(bounds))
    settings[key] = clamp(raw[key] ?? defaults[key], lo, hi, defaults[key]);
  if (['serif', 'sans'].includes(raw.font)) settings.font = raw.font;
  if (/^#[0-9a-f]{6}$/i.test(raw.accent)) settings.accent = raw.accent;
  // Preserve the shared accent from older drafts when a separate color is absent.
  for (const key of ['nameColor', 'sectionTitleColor'])
    settings[key] = /^#[0-9a-f]{6}$/i.test(raw[key]) ? raw[key] : settings.accent;
  if (['left', 'right'].includes(raw.photoSide)) settings.photoSide = raw.photoSide;
  if (['square', 'round'].includes(raw.photoShape)) settings.photoShape = raw.photoShape;
  if (['auto', 'fixed'].includes(raw.photoSizing)) settings.photoSizing = raw.photoSizing;
  const photo =
    typeof input.header.photo === 'string' &&
    input.header.photo.length < 3000000 &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.header.photo)
      ? input.header.photo
      : null;
  const seen = new Set();
  function unique(value) {
    let result = id(value);
    if (seen.has(result)) result = uid();
    seen.add(result);
    return result;
  }
  return {
    schema: 'resume-studio',
    version: 1,
    name: text(input.name, 'My resume').slice(0, 100),
    settings,
    header: {
      photo,
      photoHidden: input.header.photoHidden === true,
      fields: input.header.fields.slice(0, 20).map((f) => ({
        id: unique(f.id),
        kind: ['name', 'text', 'contact'].includes(f.kind) ? f.kind : 'text',
        text: text(f.text),
      })),
    },
    sections: input.sections.slice(0, 80).map((s) => ({
      id: unique(s.id),
      title: nullable(s.title),
      blocks: (Array.isArray(s.blocks) ? s.blocks : [])
        .slice(0, 100)
        .map((b) =>
          b.type === 'row'
            ? { id: unique(b.id), type: 'row', left: nullable(b.left), right: nullable(b.right) }
            : b.type === 'break'
              ? { id: unique(b.id), type: 'break' }
              : { id: unique(b.id), type: 'text', text: text(b.text) },
        ),
    })),
  };
}
export function move(array, id, direction) {
  const from = array.findIndex((x) => x.id === id),
    to = from + direction;
  if (from < 0 || to < 0 || to >= array.length) return;
  [array[from], array[to]] = [array[to], array[from]];
}
