import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OcrResponse, VocabType } from '../shared/types';
import { copyToClipboard } from '../shared/lib/clipboard';
import { htmlToPlainText, markdownToHtml, sanitizeRichTextHtml } from '../shared/lib/rich-text';
import { useTts } from '../features/tts';
import { useVocabContextMenu } from '../features/vocabulary';

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

export type ResultTab = 'formatted' | 'raw';

export function useResultPanel({
  result,
  isSavedDocument,
  existingWordsSet,
  onAddVocabulary,
}: UseResultPanelOptions) {
  const [tab, setTab] = useState<ResultTab>('formatted');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedRichTextHtml, setEditedRichTextHtml] = useState(
    result.richTextHtml?.trim()
      ? sanitizeRichTextHtml(result.richTextHtml)
      : markdownToHtml(result.markdown),
  );
  const [editedRaw, setEditedRaw] = useState(result.rawText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setEditedRichTextHtml(
      result.richTextHtml?.trim()
        ? sanitizeRichTextHtml(result.richTextHtml)
        : markdownToHtml(result.markdown),
    );
    setEditedRaw(result.rawText);
    setIsEditing(false);
    setTab('formatted');
  }, [result]);

  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
  }, []);

  const renderedRichTextHtml = useMemo(
    () => sanitizeRichTextHtml(editedRichTextHtml),
    [editedRichTextHtml],
  );
  const activePlainText = useMemo(
    () => (tab === 'formatted' ? htmlToPlainText(renderedRichTextHtml) : editedRaw),
    [tab, renderedRichTextHtml, editedRaw],
  );
  const setActiveContent = tab === 'formatted' ? setEditedRichTextHtml : setEditedRaw;

  const handleCopy = useCallback(() => {
    void copyToClipboard(activePlainText);
    setCopied(true);

    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  }, [activePlainText]);

  const tts = useTts(activePlainText, result.filename, isEditing);
  const vocabCtx = useVocabContextMenu({
    textareaRef,
    contentRef,
    contentText: activePlainText,
    existingWordsSet,
    onAddVocabulary: tab === 'formatted' ? onAddVocabulary : undefined,
  });

  return {
    tab,
    setTab,
    copied,
    isEditing,
    setIsEditing,
    editedRichTextHtml,
    renderedRichTextHtml,
    editedRaw,
    activePlainText,
    setActiveContent,
    setEditedRichTextHtml,
    textareaRef,
    contentRef,
    tts,
    vocabCtx,
    triggerVocabFromEditor: vocabCtx.triggerContextMenu,
    handleCopy,
    showRawTab: !isSavedDocument,
    rawCharCount: editedRaw.length,
    formattedCharCount: activePlainText.length,
    documentPayload: {
      richTextHtml: editedRichTextHtml,
    },
  };
}
