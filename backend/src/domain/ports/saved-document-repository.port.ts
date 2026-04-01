import { SavedDocument } from '../entities/saved-document.entity';
import { DocumentVocabCandidate } from '../entities/document-vocab-candidate.entity';

export abstract class ISavedDocumentRepository {
  abstract create(input: {
    markdown: string;
    richTextHtml: string | null;
    filename: string;
  }): Promise<SavedDocument>;
  abstract findAll(): Promise<SavedDocument[]>;
  abstract findById(id: string): Promise<SavedDocument | null>;
  abstract update(
    id: string,
    input: {
      markdown: string;
      richTextHtml: string | null;
    },
  ): Promise<SavedDocument | null>;
  abstract delete(id: string): Promise<boolean>;
  abstract replaceVocabularyCandidates(
    documentId: string,
    candidates: DocumentVocabCandidate[],
  ): Promise<void>;
  abstract findVocabularyCandidates(documentId: string): Promise<DocumentVocabCandidate[]>;
  abstract updateAnalysisStatus(
    id: string,
    status: SavedDocument['analysisStatus'],
    error: string | null,
  ): Promise<SavedDocument | null>;
}
