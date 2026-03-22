import { describe, it, expect } from 'vitest';
import { extractContextSentence } from './text-utils';

describe('extractContextSentence', () => {
  it('extracts sentence bounded by periods', () => {
    const text = 'First sentence. The quick brown fox jumps. Last one.';
    //                              ^start=16          ^end=41
    const result = extractContextSentence(text, 16, 41);

    expect(result).toBe('The quick brown fox jumps.');
  });

  it('extracts sentence bounded by newlines', () => {
    const text = 'Line one\nThe selected part here\nLine three';
    const result = extractContextSentence(text, 9, 30);

    expect(result).toBe('The selected part here');
  });

  it('handles selection at start of text', () => {
    const text = 'Hello world. Second sentence.';
    const result = extractContextSentence(text, 0, 5);

    expect(result).toBe('Hello world.');
  });

  it('handles selection at end of text', () => {
    const text = 'First. Last part';
    const result = extractContextSentence(text, 7, 16);

    expect(result).toBe('Last part');
  });

  it('handles text with no boundaries', () => {
    const text = 'just some plain text';
    const result = extractContextSentence(text, 5, 9);

    expect(result).toBe('just some plain text');
  });

  it('prefers period over newline when period comes first', () => {
    const text = 'Start. Middle part.\nNew line';
    const result = extractContextSentence(text, 7, 12);

    expect(result).toBe('Middle part.');
  });
});
