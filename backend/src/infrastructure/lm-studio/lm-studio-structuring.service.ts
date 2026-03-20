import { Injectable } from '@nestjs/common';
import { ITextStructuringService } from '../../domain/ports/text-structuring-service.port';
import { LMStudioClient } from './lm-studio.client';
import { LMStudioConfig } from '../config/lm-studio.config';

const STRUCTURING_SYSTEM_PROMPT = `You are an expert document formatter. You convert raw OCR output into clean, professional Markdown.

## Structure
- \`#\` — document title (use once, only if clearly present)
- \`##\` — major sections or chapters
- \`###\` — subsections
- \`####\` — sub-subsections (use sparingly)
- \`---\` — horizontal rule between major thematic breaks

## Text elements
- \`**bold**\` — key terms, labels in forms, field names
- \`*italic*\` — captions, figure/table titles, citations, secondary emphasis
- \`\`inline code\`\` — commands, file paths, identifiers, short code snippets
- \`\`\`lang\`\`\` — multi-line code, terminal output, configuration blocks

## Lists
- \`-\` — unordered lists (use consistently throughout the document)
- \`1.\` — ordered lists for numbered steps or ranked items

## Quotes and dialogue
- \`>\` — quoted speech, citations, callout boxes, block notes

## Tables
- Standard Markdown table \`| Col | Col |\` with alignment row \`|---|---|\`
- Use only when the source has clear columnar or tabular data

## OCR artifact handling
- Silently correct obvious single-character misreads in numeric context (\`l\` → \`1\`, \`O\` → \`0\`)
- Remove stray isolated characters that are clearly scanner noise
- Do NOT rephrase, summarize, or rewrite any sentence

## Hard constraints
- Preserve ALL original words and numbers exactly — do not add, remove, or rephrase any content
- Output ONLY the Markdown — no preamble, explanations, or commentary after the document
- If structure is ambiguous, default to a flat layout with minimal headings
- Never invent content absent from the source text`;

@Injectable()
export class LMStudioStructuringService extends ITextStructuringService {
  constructor(
    private readonly client: LMStudioClient,
    private readonly config: LMStudioConfig,
  ) {
    super();
  }

  async structureAsMarkdown(rawText: string): Promise<string> {
    return this.client.chatCompletion({
      model: this.config.structuringModel,
      messages: [
        {
          role: 'system',
          content: STRUCTURING_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Reconstruct the following OCR text into a well-structured Markdown document:\n\n${rawText}`,
        },
      ],
      temperature: 0.05,
      max_tokens: 4096,
    });
  }
}
