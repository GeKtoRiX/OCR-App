export type DocumentAnalysisStatus = 'idle' | 'pending' | 'ready' | 'failed';

export class SavedDocument {
  constructor(
    public readonly id: string,
    public readonly markdown: string,
    public readonly richTextHtml: string | null,
    public readonly filename: string,
    public readonly createdAt: string,
    public readonly updatedAt: string,
    public readonly analysisStatus: DocumentAnalysisStatus,
    public readonly analysisError: string | null,
    public readonly analysisUpdatedAt: string | null,
  ) {}
}
