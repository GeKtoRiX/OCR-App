const BLOCK_TAG_BREAKS = /<\/(?:p|div|section|article|aside|header|footer|nav|main|figure|figcaption|blockquote|pre|li|ul|ol|table|thead|tbody|tfoot|tr|td|th|h[1-6])>/gi;
const DANGEROUS_BLOCKS = /<(script|style|object|embed|svg|math|form|input|button|textarea|select)[\s\S]*?>[\s\S]*?<\/\1>/gi;
const DANGEROUS_SELF_CLOSING = /<(?:script|style|object|embed|svg|math|form|input|button|textarea|select|meta|link|base)[^>]*\/?>/gi;
const EVENT_HANDLER_ATTRS = /\s+on[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const UNSAFE_URL_ATTRS =
  /\s+(href|src|poster|xlink:href)\s*=\s*(?:"\s*(?:javascript:|vbscript:|data:text\/html)[^"]*"|'\s*(?:javascript:|vbscript:|data:text\/html)[^']*'|\s*(?:javascript:|vbscript:|data:text\/html)[^\s>]*)/gi;
const SRCDOC_ATTR = /\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const HTML_COMMENT_RE = /<!--([\s\S]*?)-->/g;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function sanitizeRichTextHtml(html: string): string {
  return html
    .replace(DANGEROUS_BLOCKS, '')
    .replace(DANGEROUS_SELF_CLOSING, '')
    .replace(EVENT_HANDLER_ATTRS, '')
    .replace(UNSAFE_URL_ATTRS, '')
    .replace(SRCDOC_ATTR, '')
    .trim();
}

export function htmlToPlainText(html: string): string {
  const sanitized = sanitizeRichTextHtml(html);

  return decodeHtmlEntities(
    sanitized
      .replace(HTML_COMMENT_RE, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(BLOCK_TAG_BREAKS, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );
}

export function resolveDocumentPersistence(input: {
  markdown?: string;
  richTextHtml?: string | null;
}): { markdown: string; richTextHtml: string | null } {
  const richTextHtml = input.richTextHtml?.trim()
    ? sanitizeRichTextHtml(input.richTextHtml)
    : null;

  if (richTextHtml) {
    const markdown = htmlToPlainText(richTextHtml);
    return {
      markdown,
      richTextHtml,
    };
  }

  return {
    markdown: input.markdown?.trim() ?? '',
    richTextHtml: null,
  };
}
