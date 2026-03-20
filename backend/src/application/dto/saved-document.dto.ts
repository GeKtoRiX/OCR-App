export interface CreateDocumentInput {
  markdown: string;
  filename: string;
}

export interface UpdateDocumentInput {
  markdown: string;
}

export interface SavedDocumentOutput {
  id: string;
  markdown: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
}
