export abstract class ITextStructuringService {
  abstract structureAsMarkdown(rawText: string): Promise<string>;
}
