import { Injectable } from '@nestjs/common';
import { ISavedDocumentRepository } from '../../domain/ports/saved-document-repository.port';
import { SavedDocument } from '../../domain/entities/saved-document.entity';
import {
  CreateDocumentInput,
  UpdateDocumentInput,
  SavedDocumentOutput,
} from '../dto/saved-document.dto';

@Injectable()
export class SavedDocumentUseCase {
  constructor(private readonly repository: ISavedDocumentRepository) {}

  private toOutput(doc: SavedDocument): SavedDocumentOutput {
    return {
      id: doc.id,
      markdown: doc.markdown,
      filename: doc.filename,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      analysisStatus: doc.analysisStatus,
      analysisError: doc.analysisError,
      analysisUpdatedAt: doc.analysisUpdatedAt,
    };
  }

  async create(input: CreateDocumentInput): Promise<SavedDocumentOutput> {
    const doc = await this.repository.create(input.markdown, input.filename);
    return this.toOutput(doc);
  }

  async findAll(): Promise<SavedDocumentOutput[]> {
    const docs = await this.repository.findAll();
    return docs.map((doc) => this.toOutput(doc));
  }

  async findById(id: string): Promise<SavedDocumentOutput | null> {
    const doc = await this.repository.findById(id);
    if (!doc) return null;
    return this.toOutput(doc);
  }

  async update(
    id: string,
    input: UpdateDocumentInput,
  ): Promise<SavedDocumentOutput | null> {
    const doc = await this.repository.update(id, input.markdown);
    if (!doc) return null;
    return this.toOutput(doc);
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }
}
