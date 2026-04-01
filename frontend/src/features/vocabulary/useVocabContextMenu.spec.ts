import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVocabContextMenu } from './useVocabContextMenu';

function buildTextarea(value: string, selectionStart: number, selectionEnd: number) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.selectionStart = selectionStart;
  textarea.selectionEnd = selectionEnd;
  return textarea;
}

describe('useVocabContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when vocabulary adding is disabled', () => {
    const textarea = buildTextarea('Hello world.', 0, 5);
    const textareaRef = { current: textarea };
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useVocabContextMenu({ textareaRef }));

    act(() => {
      result.current.handleContextMenu({
        preventDefault,
        clientX: 10,
        clientY: 20,
      } as unknown as React.MouseEvent<HTMLTextAreaElement>);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(result.current.contextMenu).toBeNull();
  });

  it('opens a context menu for the selected text', () => {
    const text = 'Hello world. Another sentence.';
    const textarea = buildTextarea(text, 0, 5);
    const textareaRef = { current: textarea };
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useVocabContextMenu({
      textareaRef,
      onAddVocabulary: vi.fn(),
    }));

    act(() => {
      result.current.handleContextMenu({
        preventDefault,
        clientX: 15,
        clientY: 25,
      } as unknown as React.MouseEvent<HTMLTextAreaElement>);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.contextMenu).toEqual({
      x: 15,
      y: 25,
      selectedText: 'Hello',
      contextSentence: 'Hello world.',
    });
  });

  it('ignores empty or zero-length selections', () => {
    const textarea = buildTextarea('Hello world.', 0, 0);
    const textareaRef = { current: textarea };
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useVocabContextMenu({
      textareaRef,
      onAddVocabulary: vi.fn(),
    }));

    act(() => {
      result.current.handleContextMenu({
        preventDefault,
        clientX: 15,
        clientY: 25,
      } as unknown as React.MouseEvent<HTMLTextAreaElement>);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(result.current.contextMenu).toBeNull();
  });

  it('moves selected text into the vocab form and detects duplicates', () => {
    const textarea = buildTextarea('Hello world.', 0, 5);
    const textareaRef = { current: textarea };
    const { result } = renderHook(() => useVocabContextMenu({
      textareaRef,
      existingWordsSet: new Set(['hello']),
      onAddVocabulary: vi.fn(),
    }));

    act(() => {
      result.current.handleContextMenu({
        preventDefault: vi.fn(),
        clientX: 15,
        clientY: 25,
      } as unknown as React.MouseEvent<HTMLTextAreaElement>);
    });

    act(() => {
      result.current.handleVocabTypeSelect('idiom');
    });

    expect(result.current.contextMenu).toBeNull();
    expect(result.current.vocabForm).toEqual({
      x: 15,
      y: 25,
      selectedText: 'Hello',
      contextSentence: 'Hello world.',
      vocabType: 'idiom',
      isDuplicate: true,
    });
  });

  it('preserves the selection captured before right click collapses it', () => {
    const textarea = buildTextarea('Hello world.', 0, 5);
    const textareaRef = { current: textarea };
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useVocabContextMenu({
      textareaRef,
      onAddVocabulary: vi.fn(),
    }));

    act(() => {
      result.current.handleMouseDownCapture({
        button: 2,
      } as React.MouseEvent<HTMLTextAreaElement>);
    });

    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;

    act(() => {
      result.current.handleContextMenu({
        preventDefault,
        clientX: 15,
        clientY: 25,
      } as unknown as React.MouseEvent<HTMLTextAreaElement>);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.contextMenu).toEqual({
      x: 15,
      y: 25,
      selectedText: 'Hello',
      contextSentence: 'Hello world.',
    });
  });

  it('submits the selected vocabulary item and clears the form', () => {
    const onAddVocabulary = vi.fn();
    const textarea = buildTextarea('Hello world.', 0, 5);
    const textareaRef = { current: textarea };
    const { result } = renderHook(() => useVocabContextMenu({
      textareaRef,
      onAddVocabulary,
    }));

    act(() => {
      result.current.handleContextMenu({
        preventDefault: vi.fn(),
        clientX: 15,
        clientY: 25,
      } as unknown as React.MouseEvent<HTMLTextAreaElement>);
    });

    act(() => {
      result.current.handleVocabTypeSelect('word');
    });

    act(() => {
      result.current.handleVocabAdd('Hello', 'привет', 'Hello world.', 'word');
    });

    expect(onAddVocabulary).toHaveBeenCalledWith(
      'Hello',
      'word',
      'привет',
      'Hello world.',
    );
    expect(result.current.vocabForm).toBeNull();
  });

  it('exposes close helpers for both menu states', () => {
    const textarea = buildTextarea('Hello world.', 0, 5);
    const textareaRef = { current: textarea };
    const { result } = renderHook(() => useVocabContextMenu({
      textareaRef,
      onAddVocabulary: vi.fn(),
    }));

    act(() => {
      result.current.handleContextMenu({
        preventDefault: vi.fn(),
        clientX: 15,
        clientY: 25,
      } as unknown as React.MouseEvent<HTMLTextAreaElement>);
    });

    act(() => {
      result.current.closeContextMenu();
    });

    expect(result.current.contextMenu).toBeNull();

    act(() => {
      result.current.handleContextMenu({
        preventDefault: vi.fn(),
        clientX: 15,
        clientY: 25,
      } as unknown as React.MouseEvent<HTMLTextAreaElement>);
      result.current.handleVocabTypeSelect('word');
    });

    act(() => {
      result.current.closeVocabForm();
    });

    expect(result.current.vocabForm).toBeNull();
  });
});
