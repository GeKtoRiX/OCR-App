import { DocumentVocabCandidate } from '../entities/document-vocab-candidate.entity';

export interface ExtractDocumentVocabularyInput {
  documentId: string;
  markdown: string;
  targetLang: string;
  nativeLang: string;
}

export abstract class IDocumentVocabularyExtractor {
  abstract extract(
    input: ExtractDocumentVocabularyInput,
  ): Promise<DocumentVocabCandidate[]>;
}
