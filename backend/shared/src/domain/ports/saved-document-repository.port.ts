import { SavedDocument } from '../entities/saved-document.entity';

export abstract class ISavedDocumentRepository {
  abstract create(markdown: string, filename: string): Promise<SavedDocument>;
  abstract findAll(): Promise<SavedDocument[]>;
  abstract findById(id: string): Promise<SavedDocument | null>;
  abstract update(id: string, markdown: string): Promise<SavedDocument | null>;
  abstract delete(id: string): Promise<boolean>;
}
