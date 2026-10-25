export const STORAGE_KEY = 'resume-studio-document-v1';
export const uid = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const defaults = {
  font: 'serif',
  fontSize: 14,
  lineHeight: 1.65,
  titleSize: 20,
  nameSize: 34,
  margin: 14,
  sectionGap: 18,
  paragraphGap: 6,
  listGap: 3,
  accent: '#353387',
  photoWidth: 29,
  photoSide: 'right',
  photoShape: 'square',
};
export function block(type = 'text') {
  if (type === 'row')
    return { id: uid(), type, left: '公司 / 项目名称 · 职位', right: '2022.07 — 至今' };
  if (type === 'break') return { id: uid(), type };
  return {
    id: uid(),
    type: 'text',
    text: '在这里填写内容。支持 **加粗**、*斜体*、==高亮== 和 ++下划线++。\n\n- 描述你的责任、技术方案与结果\n- 补充可核验的指标',
  };
}
export function section(title = '新模块') {
  return { id: uid(), title, blocks: [block('row'), block('text')] };
}
export function initialDocument() {
  return {
    schema: 'resume-studio',
    version: 1,
    name: '我的社招简历',
    settings: { ...defaults },
    header: {
      photo: null,
      fields: [
        { id: uid(), kind: 'name', text: '林 一' },
        { id: uid(), kind: 'text', text: '高级研发 / 算法工程师' },
        {
          id: uid(),
          kind: 'contact',
          text: '上海 · 5 年经验 · name@example.com\n[GitHub](https://github.com/your-name) · [个人主页](https://example.com)',
        },
      ],
    },
    sections: [
      {
        id: uid(),
        title: '专业概述',
        blocks: [
          {
            id: uid(),
            type: 'text',
            text: '聚焦推荐、搜索与大模型应用，具备从模型实验到在线服务的落地经验。用两句话说明你的核心方向与最有说服力的成果。',
          },
        ],
      },
      {
        id: uid(),
        title: '工作经历',
        blocks: [
          {
            id: uid(),
            type: 'row',
            left: '**某互联网公司 · 高级工程师**',
            right: '2022.07 — 至今',
          },
          {
            id: uid(),
            type: 'text',
            text: '*推荐与智能应用团队*\n\n- **负责核心业务链路**，描述服务规模、技术难点与你承担的具体责任。\n- **设计评估与上线流程**，补充可核验的指标、对照口径和最终业务结果。',
          },
        ],
      },
      {
        id: uid(),
        title: '核心项目',
        blocks: [
          { id: uid(), type: 'row', left: '**检索增强问答系统**', right: '2025.03 — 至今' },
          {
            id: uid(),
            type: 'text',
            text: '*Python · PyTorch · 向量检索 · Reranker*\n\n- 围绕复杂知识问答，设计文档处理、混合召回、重排与引用校验链路。\n- 结果：填写真实的效果、时延和成本变化，并注明评估集与实验口径。',
          },
        ],
      },
      {
        id: uid(),
        title: '专业技能',
        blocks: [
          {
            id: uid(),
            type: 'text',
            text: '**开发：** Python / C++ / SQL\n**算法：** 检索 / 排序 / 大模型\n**工程：** Linux / Docker / 服务化',
          },
        ],
      },
      {
        id: uid(),
        title: '教育背景',
        blocks: [{ id: uid(), type: 'row', left: '**某大学 · 计算机硕士**', right: '2018 — 2021' }],
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
    throw new Error('不是有效的简历备份文件，或文件版本不受支持。');
  const settings = { ...defaults },
    raw = input.settings || {};
  const bounds = {
    fontSize: [10, 20],
    lineHeight: [1.15, 2.2],
    titleSize: [15, 28],
    nameSize: [24, 46],
    margin: [8, 24],
    sectionGap: [4, 32],
    paragraphGap: [0, 16],
    listGap: [0, 12],
    photoWidth: [20, 40],
  };
  for (const [key, [lo, hi]] of Object.entries(bounds))
    settings[key] = clamp(raw[key] ?? defaults[key], lo, hi, defaults[key]);
  if (['serif', 'sans'].includes(raw.font)) settings.font = raw.font;
  if (/^#[0-9a-f]{6}$/i.test(raw.accent)) settings.accent = raw.accent;
  if (['left', 'right'].includes(raw.photoSide)) settings.photoSide = raw.photoSide;
  if (['square', 'round'].includes(raw.photoShape)) settings.photoShape = raw.photoShape;
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
    name: text(input.name, '我的简历').slice(0, 100),
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
