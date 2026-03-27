/**
 * Extract the sentence surrounding a selection within a text.
 * Sentence boundaries: period (`.`) or newline (`\n`).
 */
export function extractContextSentence(
  fullText: string,
  selectionStart: number,
  selectionEnd: number,
): string {
  const before = fullText.substring(0, selectionStart);
  const after = fullText.substring(selectionEnd);

  const sentenceStart = Math.max(
    before.lastIndexOf('.') + 1,
    before.lastIndexOf('\n') + 1,
    0,
  );

  const dotAfter = after.indexOf('.');
  const nlAfter = after.indexOf('\n');
  const sentenceEnd =
    dotAfter >= 0 && (nlAfter < 0 || dotAfter < nlAfter)
      ? selectionEnd + dotAfter + 1
      : nlAfter >= 0
        ? selectionEnd + nlAfter
        : fullText.length;

  return fullText.substring(sentenceStart, sentenceEnd).trim();
}
