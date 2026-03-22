import { useCallback, useEffect, useRef, useState } from 'react';
import type { OcrResponse, VocabType } from '../model/types';
import { copyToClipboard } from '../model/clipboard';
import { useTts } from './useTts';
import { useVocabContextMenu } from './useVocabContextMenu';

interface UseResultPanelOptions {
  result: OcrResponse;
  isSavedDocument?: boolean;
  existingWordsSet?: Set<string>;
  onAddVocabulary?: (
    word: string,
    vocabType: VocabType,
    translation: string,
    contextSentence: string,
  ) => void;
}

export type ResultTab = 'markdown' | 'raw';

export function useResultPanel({
  result,
  isSavedDocument,
  existingWordsSet,
  onAddVocabulary,
}: UseResultPanelOptions) {
  const [tab, setTab] = useState<ResultTab>('markdown');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState(result.markdown);
  const [editedRaw, setEditedRaw] = useState(result.rawText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLPreElement>(null);
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setEditedMarkdown(result.markdown);
    setEditedRaw(result.rawText);
    setIsEditing(false);
    setTab('markdown');
  }, [result]);

  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
  }, []);

  const activeContent = tab === 'markdown' ? editedMarkdown : editedRaw;
  const setActiveContent = tab === 'markdown' ? setEditedMarkdown : setEditedRaw;

  const handleCopy = useCallback(() => {
    void copyToClipboard(activeContent);
    setCopied(true);

    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  }, [activeContent]);

  const tts = useTts(activeContent, result.filename);
  const vocabCtx = useVocabContextMenu({
    textareaRef,
    contentRef,
    contentText: activeContent,
    existingWordsSet,
    onAddVocabulary: !isEditing && tab === 'markdown' ? onAddVocabulary : undefined,
  });

  return {
    tab,
    setTab,
    copied,
    isEditing,
    setIsEditing,
    editedMarkdown,
    editedRaw,
    activeContent,
    setActiveContent,
    textareaRef,
    contentRef,
    tts,
    vocabCtx,
    handleCopy,
    showRawTab: !isSavedDocument,
    rawCharCount: editedRaw.length,
    markdownCharCount: editedMarkdown.length,
  };
}
