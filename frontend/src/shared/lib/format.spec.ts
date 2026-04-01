import { describe, expect, it } from 'vitest';
import { formatFileSize } from './format';

describe('formatFileSize', () => {
  it('formats kilobytes for files under one megabyte', () => {
    expect(formatFileSize(2048)).toBe('2 KB');
  });

  it('formats megabytes with one decimal for larger files', () => {
    expect(formatFileSize(3 * 1024 * 1024 + 512 * 1024)).toBe('3.5 MB');
  });
});
