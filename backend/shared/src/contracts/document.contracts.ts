export const DOCUMENT_PATTERNS = {
  CREATE: 'document.create',
  FIND_ALL: 'document.find_all',
  FIND_BY_ID: 'document.find_by_id',
  UPDATE: 'document.update',
  DELETE: 'document.delete',
} as const;

export interface SavedDocumentDto {
  id: string;
  markdown: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentPayload {
  markdown: string;
  filename: string;
}

export interface FindDocumentByIdPayload {
  id: string;
}

export interface UpdateDocumentPayload {
  id: string;
  markdown: string;
}

export interface DeleteDocumentPayload {
  id: string;
}
