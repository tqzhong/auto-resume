import MarkdownIt from 'markdown-it';
import mark from 'markdown-it-mark';
import ins from 'markdown-it-ins';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
export const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: false,
})
  .use(mark)
  .use(ins)
  .use(footnote)
  .use(taskLists, { enabled: false })
  .use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: { throwOnError: false, trust: false, strict: 'ignore', maxExpand: 500 },
  });
const baseLink =
  markdown.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return baseLink(tokens, idx, options, env, self);
};
markdown.renderer.rules.image = (tokens, idx) =>
  `<span class="image-note">[Image: ${markdown.utils.escapeHtml(tokens[idx].content)}]</span>`;
export const renderMarkdown = (source) => markdown.render(String(source ?? ''));
