import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkRehype from 'remark-rehype';
import rehypeDomStringify from 'rehype-dom-stringify';

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const UNSAFE_URL_PROTOCOLS = /^(?:javascript:|vbscript:|data:text\/html)/i;
const DANGEROUS_TAGS = new Set([
  'script',
  'style',
  'object',
  'embed',
  'svg',
  'math',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'meta',
  'link',
  'base',
]);

const markdownToHtmlProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkBreaks)
  .use(remarkRehype)
  .use(rehypeDomStringify);

function stripDangerousNodes(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];

  while (walker.nextNode()) {
    const element = walker.currentNode as Element;
    const tagName = element.tagName.toLowerCase();

    if (DANGEROUS_TAGS.has(tagName)) {
      toRemove.push(element);
      continue;
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (name === 'srcdoc') {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (
        (name === 'href' || name === 'src' || name === 'poster' || name === 'xlink:href') &&
        UNSAFE_URL_PROTOCOLS.test(value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const element of toRemove) {
    element.remove();
  }
}

function walkPlainText(node: Node, parts: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.textContent ?? '');
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'br') {
    parts.push('\n');
    return;
  }

  const addBreakBefore = BLOCK_TAGS.has(tagName) && parts.length > 0 && !parts[parts.length - 1].endsWith('\n');
  if (addBreakBefore) {
    parts.push('\n');
  }

  for (const child of [...element.childNodes]) {
    walkPlainText(child, parts);
  }

  if (BLOCK_TAGS.has(tagName) && !parts[parts.length - 1]?.endsWith('\n')) {
    parts.push('\n');
  }
}

export function sanitizeRichTextHtml(html: string): string {
  if (!html.trim()) {
    return '';
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  stripDangerousNodes(doc.body);
  return doc.body.innerHTML.trim();
}

export function htmlToPlainText(html: string): string {
  if (!html.trim()) {
    return '';
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  stripDangerousNodes(doc.body);

  const parts: string[] = [];
  for (const child of [...doc.body.childNodes]) {
    walkPlainText(child, parts);
  }

  return parts
    .join('')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function escapeTextAsHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function plainTextToHtml(text: string): string {
  if (!text.trim()) {
    return '<p></p>';
  }

  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeTextAsHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) {
    return '<p></p>';
  }

  const html = markdownToHtmlProcessor.processSync(markdown).toString();
  return sanitizeRichTextHtml(html);
}
