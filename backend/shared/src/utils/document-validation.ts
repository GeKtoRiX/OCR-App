export function hasDocumentContent(input: {
  markdown?: string;
  richTextHtml?: string | null;
}): boolean {
  return Boolean(input.markdown?.trim() || input.richTextHtml?.trim());
}
