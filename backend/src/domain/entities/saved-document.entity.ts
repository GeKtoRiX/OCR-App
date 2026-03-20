export class SavedDocument {
  constructor(
    public readonly id: string,
    public readonly markdown: string,
    public readonly filename: string,
    public readonly createdAt: string,
    public readonly updatedAt: string,
  ) {}
}
