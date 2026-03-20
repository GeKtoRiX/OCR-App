export class CreateDocumentDto {
  markdown!: string;
  filename!: string;
}

export class UpdateDocumentDto {
  markdown!: string;
}

export class SavedDocumentResponseDto {
  id!: string;
  markdown!: string;
  filename!: string;
  createdAt!: string;
  updatedAt!: string;
}
