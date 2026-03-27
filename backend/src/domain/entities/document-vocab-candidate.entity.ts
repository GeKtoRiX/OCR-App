import type { VocabType } from './vocabulary-word.entity';

export type DocumentCandidatePos = 'noun' | 'verb' | 'adjective' | 'adverb' | null;
export type DocumentCandidateReviewSource =
  | 'base_nlp'
  | 'llm_added'
  | 'llm_reclassified';

export class DocumentVocabCandidate {
  constructor(
    public readonly id: string,
    public readonly documentId: string,
    public readonly surface: string,
    public readonly normalized: string,
    public readonly lemma: string,
    public readonly vocabType: VocabType,
    public readonly pos: DocumentCandidatePos,
    public readonly translation: string,
    public readonly contextSentence: string,
    public readonly sentenceIndex: number,
    public readonly startOffset: number,
    public readonly endOffset: number,
    public readonly selectedByDefault: boolean,
    public readonly isDuplicate: boolean,
    public readonly reviewSource: DocumentCandidateReviewSource,
  ) {}
}
