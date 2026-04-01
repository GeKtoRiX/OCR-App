import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTextInput } from './useTextInput';

describe('useTextInput', () => {
  it('tracks text, filename, and clear state', () => {
    const { result } = renderHook(() => useTextInput());

    act(() => {
      result.current.setText('  Hello world  ');
      result.current.setFilename('example.md');
    });

    expect(result.current.text).toBe('  Hello world  ');
    expect(result.current.filename).toBe('example.md');
    expect(result.current.canSubmit).toBe(true);

    act(() => {
      result.current.clear();
    });

    expect(result.current.text).toBe('');
    expect(result.current.filename).toBe('');
    expect(result.current.canSubmit).toBe(false);
  });

  it('disallows submission when text is blank after trimming', () => {
    const { result } = renderHook(() => useTextInput());

    act(() => {
      result.current.setText('   ');
    });

    expect(result.current.canSubmit).toBe(false);
  });
});
