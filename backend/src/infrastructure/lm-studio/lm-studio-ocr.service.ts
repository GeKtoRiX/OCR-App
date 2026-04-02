import { Injectable } from '@nestjs/common';
import { ImageData } from '../../domain/entities/image-data.entity';
import {
  IOCRService,
  OcrExtractionResult,
} from '../../domain/ports/ocr-service.port';
import { ILmStudioChatPort } from '../../domain/ports/lm-studio-chat.port';
import { LMStudioConfig } from '../config/lm-studio.config';

@Injectable()
export class LMStudioOCRService extends IOCRService {
  private static readonly OCR_MAX_TOKENS = 2048;

  private static readonly OCR_SYSTEM_PROMPT = [
    'You are an OCR engine.',
    'Transcribe only the visible text from the image.',
    'Do not summarize, explain, translate, correct, or paraphrase.',
    'Do not add commentary, markdown fences, labels, or metadata.',
    'Do not think aloud or expose reasoning.',
    'Preserve the reading order and structure as closely as possible.',
    'Keep titles, section headers, labels, exercise numbers, answer options, and speaker turns on separate lines when they appear separate in the image.',
    'If the page contains panels, dialogs, sidebars, or short boxed phrases, keep them as distinct blocks instead of merging everything into one paragraph.',
    'If some characters are unclear, output your best literal transcription instead of describing uncertainty.',
    'Return only the OCR text.',
  ].join(' ');

  private static readonly OCR_USER_PROMPT = [
    'Extract all visible text from this page.',
    'Preserve line breaks aggressively.',
    'Keep standalone labels such as "Vocabulary", "Grammar", "Real World", "TIP", "Help with Grammar", "A", "B", "a)", "b)", "c)", and speaker names on their own lines when appropriate.',
    'Keep dialogue turns on separate lines.',
    'Use blank lines only between clearly separate blocks.',
    'Return only the extracted text.',
  ].join(' ');

  private static readonly STRUCTURAL_HEADERS = [
    'Vocabulary',
    'Grammar',
    'Real World',
    'Help with Grammar',
    'TIP',
  ];

  constructor(
    private readonly client: ILmStudioChatPort,
    private readonly config: LMStudioConfig,
  ) {
    super();
  }

  async extractText(image: ImageData): Promise<OcrExtractionResult> {
    const rawModelText = await this.client.chatCompletion(
      [
        {
          role: 'system',
          content: LMStudioOCRService.OCR_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: image.toBase64DataUrl() },
            },
            {
              type: 'text',
              text: LMStudioOCRService.OCR_USER_PROMPT,
            },
          ],
        },
      ],
      this.config.ocrModel,
      {
        temperature: 0.0,
        maxTokens: LMStudioOCRService.OCR_MAX_TOKENS,
        stop: ['<think>', '</think>'],
      },
    );

    const text = this.postProcessModelOutput(rawModelText);
    const lines = this.buildLines(text);

    return {
      rawText: text,
      markdown: text,
      blocks: [
        {
          type: 'text',
          bbox: [],
          text,
          lines,
        },
      ],
    };
  }

  private postProcessModelOutput(text: string): string {
    let normalized = text.replace(/\r\n?/g, '\n').trim();

    normalized = normalized.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    normalized = normalized
      .replace(/^```(?:text|txt|markdown)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    normalized = normalized
      .replace(/^\s*(?:here(?:'s| is)\s+the\s+(?:ocr|extracted)\s+text\s*:?)\s*/i, '')
      .replace(/^\s*ocr\s*:\s*/i, '')
      .trim();

    const lines = normalized
      .split('\n')
      .flatMap((line) => this.expandStructuralLine(line))
      .map((line) => this.normalizeLine(line))
      .filter((line) => line.length > 0);

    return this.mergeParagraphSpacing(lines);
  }

  private expandStructuralLine(line: string): string[] {
    let expanded = line.trim();
    if (!expanded) {
      return [];
    }

    expanded = expanded
      .replace(/\s+(?=\d+[A-Z]\b)/g, '\n')
      .replace(/\s+(?=(?:Vocabulary|Grammar|Real World|Help with Grammar|TIP)\b)/g, '\n')
      .replace(/\s+(?=(?:[a-z]\))\s)/g, '\n')
      .replace(/\s+(?=(?:[A-Z])\s+(?:[A-Z]{2,12})\b)/g, '\n')
      .replace(
        /\s+(?=(?:[A-Z]{2,12})\s+(?:Hello|Hi|Nice|What|How|I['’]?m|'m|You|m\b|too\b|OK\b))/g,
        '\n',
      )
      .replace(/(?<=[?.!])\s+(?=(?:\d+\s+[a-z]\)))/g, '\n');

    return expanded.split('\n');
  }

  private normalizeLine(line: string): string {
    let normalized = line.replace(/[ \t]+/g, ' ').trim();

    normalized = normalized
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([([{])\s+/g, '$1')
      .replace(/\s+([)\]}.])/g, '$1');

    for (const header of LMStudioOCRService.STRUCTURAL_HEADERS) {
      normalized = normalized.replace(
        new RegExp(`^(\\d+[A-Z]?\\s+)?${header}\\s+`, 'i'),
        (match, prefix) => `${prefix ?? ''}${header} `,
      );
    }

    return normalized;
  }

  private mergeParagraphSpacing(lines: string[]): string {
    const output: string[] = [];

    for (const line of lines) {
      const needsSpacer =
        output.length > 0 &&
        (this.isSectionBoundary(line) ||
          (this.isDialogueCue(line) && !this.isDialogueCue(output[output.length - 1])));

      if (needsSpacer && output[output.length - 1] !== '') {
        output.push('');
      }

      output.push(line);
    }

    return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  private isSectionBoundary(line: string): boolean {
    return (
      /^(?:\d+[A-Z]\b|\d+\s+[a-z]\)|[A-Z]\b)$/.test(line) ||
      LMStudioOCRService.STRUCTURAL_HEADERS.some((header) =>
        line.startsWith(header),
      )
    );
  }

  private isDialogueCue(line: string): boolean {
    return /^[A-Z]{2,12}\s+/.test(line);
  }

  private buildLines(text: string): Array<{ text: string; bbox: number[] }> {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => ({ text: line, bbox: [] }));
  }
}
