import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SaveVocabularyOverlay } from './SaveVocabularyOverlay';
import type { DocumentVocabCandidate, SavedDocument } from '../../shared/types';

describe('SaveVocabularyOverlay', () => {
  const document: SavedDocument = {
    id: 'doc-1',
    markdown: '# Sample',
    richTextHtml: null,
    filename: 'sample.md',
    createdAt: '2026-03-27T10:00:00.000Z',
    updatedAt: '2026-03-27T10:00:00.000Z',
    analysisStatus: 'ready',
    analysisError: null,
    analysisUpdatedAt: '2026-03-27T10:00:00.000Z',
  };

  const candidates: DocumentVocabCandidate[] = [
    {
      id: 'cand-1',
      surface: 'gave up',
      normalized: 'give up',
      lemma: 'give up',
      vocabType: 'phrasal_verb',
      pos: 'verb',
      translation: 'сдаваться',
      contextSentence: 'She gave up too early.',
      sentenceIndex: 0,
      startOffset: 0,
      endOffset: 7,
      selectedByDefault: true,
      isDuplicate: false,
      reviewSource: 'base_nlp',
    },
  ];

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('allows editing the active candidate before confirm', async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn().mockResolvedValue(candidates);
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <SaveVocabularyOverlay
        document={document}
        langPair={{ targetLang: 'en', nativeLang: 'ru' }}
        status="ready"
        candidates={candidates}
        error={null}
        llmReviewApplied={false}
        confirmResult={null}
        onPrepare={onPrepare}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith(false));

    await user.clear(screen.getByLabelText('Word'));
    await user.type(screen.getByLabelText('Word'), 'stop trying');
    await user.selectOptions(screen.getByLabelText('Type'), 'expression');
    await user.clear(screen.getByLabelText('Translation'));
    await user.type(screen.getByLabelText('Translation'), 'перестать пытаться');
    await user.clear(screen.getByLabelText('Context'));
    await user.type(screen.getByLabelText('Context'), 'She stopped trying after the second attempt.');
    await user.click(screen.getByRole('button', { name: 'Confirm Save' }));

    expect(onConfirm).toHaveBeenCalledWith([
      {
        candidateId: 'cand-1',
        word: 'stop trying',
        vocabType: 'expression',
        pos: 'verb',
        translation: 'перестать пытаться',
        contextSentence: 'She stopped trying after the second attempt.',
      },
    ]);
  });

  it('runs llm review with selected ids from checked candidates', async () => {
    const user = userEvent.setup();
    const onPrepare = vi
      .fn()
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce(candidates);

    render(
      <SaveVocabularyOverlay
        document={document}
        langPair={{ targetLang: 'en', nativeLang: 'ru' }}
        status="ready"
        candidates={candidates}
        error={null}
        llmReviewApplied={false}
        confirmResult={null}
        onPrepare={onPrepare}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith(false));
    await user.click(screen.getByRole('button', { name: 'Run LLM review' }));

    expect(onPrepare).toHaveBeenLastCalledWith(true, ['cand-1']);
  });

  it('blocks confirm when a selected word is blank', async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn().mockResolvedValue(candidates);
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <SaveVocabularyOverlay
        document={document}
        langPair={{ targetLang: 'en', nativeLang: 'ru' }}
        status="ready"
        candidates={candidates}
        error={null}
        llmReviewApplied={false}
        confirmResult={null}
        onPrepare={onPrepare}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith(false));
    await user.clear(screen.getByLabelText('Word'));

    expect(
      screen.getByText('Selected items must have a non-empty word before saving.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm Save' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the saved summary state', () => {
    render(
      <SaveVocabularyOverlay
        document={document}
        langPair={{ targetLang: 'en', nativeLang: 'ru' }}
        status="saved"
        candidates={candidates}
        error={null}
        llmReviewApplied
        confirmResult={{
          savedCount: 2,
          skippedDuplicateCount: 1,
          failedCount: 0,
          savedItems: [],
          skippedItems: [],
          failedItems: [],
        }}
        onPrepare={vi.fn().mockResolvedValue(candidates)}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Saved:')).toBeVisible();
    expect(screen.getByText('Skipped duplicates:')).toBeVisible();
    expect(screen.getByText('Failed:')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Done' })).toBeVisible();
  });

  it('shows an empty state when no candidates are available after preparation', () => {
    render(
      <SaveVocabularyOverlay
        document={document}
        langPair={{ targetLang: 'en', nativeLang: 'ru' }}
        status="ready"
        candidates={[]}
        error={null}
        llmReviewApplied={false}
        confirmResult={null}
        onPrepare={vi.fn().mockResolvedValue([])}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText('No vocabulary candidates found for this document.'),
    ).toBeVisible();
  });
});
