import { useRef, useState, useCallback, type RefObject } from 'react';
import type { VocabType } from '../model/types';
import { extractContextSentence } from '../model/text-utils';

export interface ContextMenuState {
  x: number;
  y: number;
  selectedText: string;
  contextSentence: string;
}

export interface VocabFormState {
  x: number;
  y: number;
  selectedText: string;
  contextSentence: string;
  vocabType: VocabType;
  isDuplicate: boolean;
}

interface SelectionSnapshot {
  selectedText: string;
  contextSentence: string;
}

interface UseVocabContextMenuOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  contentRef?: RefObject<HTMLElement | null>;
  contentText?: string;
  existingWordsSet?: Set<string>;
  onAddVocabulary?: (
    word: string,
    vocabType: VocabType,
    translation: string,
    contextSentence: string,
  ) => void;
}

export function useVocabContextMenu({
  textareaRef,
  contentRef,
  contentText,
  existingWordsSet,
  onAddVocabulary,
}: UseVocabContextMenuOptions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [vocabForm, setVocabForm] = useState<VocabFormState | null>(null);
  const selectionSnapshotRef = useRef<SelectionSnapshot | null>(null);

  const readSelectionSnapshot = useCallback((): SelectionSnapshot | null => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return null;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) {
      return null;
    }

    const selectedText = textarea.value.substring(start, end).trim();
    if (!selectedText) {
      return null;
    }

    return {
      selectedText,
      contextSentence: extractContextSentence(textarea.value, start, end),
    };
  }, [textareaRef]);

  const readRenderedSelectionSnapshot = useCallback((): SelectionSnapshot | null => {
    const container = contentRef?.current;
    const fullText = contentText ?? container?.textContent ?? '';
    const selection = window.getSelection();
    if (!container || !fullText || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (
      !container.contains(range.startContainer) ||
      !container.contains(range.endContainer)
    ) {
      return null;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return null;
    }

    const offsetRange = range.cloneRange();
    offsetRange.selectNodeContents(container);
    offsetRange.setEnd(range.startContainer, range.startOffset);
    const selectionStart = offsetRange.toString().length;
    const selectionEnd = selectionStart + range.toString().length;

    return {
      selectedText,
      contextSentence: extractContextSentence(fullText, selectionStart, selectionEnd),
    };
  }, [contentRef, contentText]);

  const rememberSelection = useCallback(() => {
    selectionSnapshotRef.current = readSelectionSnapshot();
  }, [readSelectionSnapshot]);

  const rememberRenderedSelection = useCallback(() => {
    selectionSnapshotRef.current = readRenderedSelectionSnapshot();
  }, [readRenderedSelectionSnapshot]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      if (!onAddVocabulary) return;
      const selection = readSelectionSnapshot() ?? selectionSnapshotRef.current;
      if (!selection) return;
      e.preventDefault();

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        selectedText: selection.selectedText,
        contextSentence: selection.contextSentence,
      });
      setVocabForm(null);
    },
    [onAddVocabulary, readSelectionSnapshot],
  );

  const handleMouseDownCapture = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      if (e.button === 2) {
        rememberSelection();
      }
    },
    [rememberSelection],
  );

  const handleRenderedContextMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!onAddVocabulary) return;
      const selection = readRenderedSelectionSnapshot() ?? selectionSnapshotRef.current;
      if (!selection) return;
      e.preventDefault();

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        selectedText: selection.selectedText,
        contextSentence: selection.contextSentence,
      });
      setVocabForm(null);
    },
    [onAddVocabulary, readRenderedSelectionSnapshot],
  );

  const handleRenderedMouseDownCapture = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (e.button === 2) {
        rememberRenderedSelection();
      }
    },
    [rememberRenderedSelection],
  );

  const handleVocabTypeSelect = useCallback(
    (vocabType: VocabType) => {
      if (!contextMenu) return;
      const isDuplicate = existingWordsSet
        ? existingWordsSet.has(contextMenu.selectedText.toLowerCase())
        : false;
      setVocabForm({
        x: contextMenu.x,
        y: contextMenu.y,
        selectedText: contextMenu.selectedText,
        contextSentence: contextMenu.contextSentence,
        vocabType,
        isDuplicate,
      });
      setContextMenu(null);
    },
    [contextMenu, existingWordsSet],
  );

  const handleVocabAdd = useCallback(
    (translation: string) => {
      if (!vocabForm || !onAddVocabulary) return;
      onAddVocabulary(
        vocabForm.selectedText,
        vocabForm.vocabType,
        translation,
        vocabForm.contextSentence,
      );
      setVocabForm(null);
    },
    [vocabForm, onAddVocabulary],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);
  const closeVocabForm = useCallback(() => {
    setVocabForm(null);
  }, []);

  return {
    contextMenu,
    vocabForm,
    handleMouseDownCapture,
    rememberSelection,
    handleContextMenu,
    handleRenderedMouseDownCapture,
    rememberRenderedSelection,
    handleRenderedContextMenu,
    handleVocabTypeSelect,
    handleVocabAdd,
    closeContextMenu,
    closeVocabForm,
  };
}
