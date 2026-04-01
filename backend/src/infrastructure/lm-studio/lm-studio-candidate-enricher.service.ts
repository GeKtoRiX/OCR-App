import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ILmStudioChatPort } from '../../domain/ports/lm-studio-chat.port';
import { DocumentVocabCandidate } from '../../domain/entities/document-vocab-candidate.entity';
import type {
  DocumentCandidatePos,
  DocumentCandidateReviewSource,
} from '../../domain/entities/document-vocab-candidate.entity';
import type { VocabType } from '../../domain/entities/vocabulary-word.entity';
import { LMStudioConfig } from '../config/lm-studio.config';
import { parseJsonResponse } from './lm-studio-vocabulary.utils';

const DOCUMENT_VOCAB_REVIEW_SYSTEM_PROMPT = `You prepare vocabulary candidates for language learners.

You receive:
- the source markdown text
- extracted vocabulary candidates
- a target/native language pair
- whether LLM review is enabled

Tasks:
1. Always fill a concise translation for each kept candidate in the native language.
2. If LLM review is disabled:
   - preserve the candidate list size
   - do not add or remove items
   - keep reviewSource as "base_nlp"
3. If LLM review is enabled:
   - you may remove false positives
   - you may reclassify items between "word", "phrasal_verb", and "idiom"
   - you may add important missing items found in the text
   - use reviewSource "llm_reclassified" for changed existing items
   - use reviewSource "llm_added" for newly added items

Rules:
- Output ONLY valid JSON, no prose.
- Keep contextSentence short and taken from the source text.
- Prefer study-worthy items over exhaustive coverage.
- Do not invent items absent from the source.

Return a JSON array of objects with this exact shape:
[
  {
    "id": "existing-id-or-empty-for-new",
    "surface": "surface form",
    "normalized": "normalized form",
    "lemma": "lemma",
    "vocabType": "word",
    "pos": "noun",
    "translation": "перевод",
    "contextSentence": "Sentence from the text.",
    "sentenceIndex": 0,
    "startOffset": 0,
    "endOffset": 10,
    "selectedByDefault": true,
    "reviewSource": "base_nlp"
  }
]`;

interface DocumentCandidateLlmPayload {
  id?: string;
  surface?: string;
  normalized?: string;
  lemma?: string;
  vocabType?: VocabType;
  pos?: DocumentCandidatePos;
  translation?: string;
  contextSentence?: string;
  sentenceIndex?: number;
  startOffset?: number;
  endOffset?: number;
  selectedByDefault?: boolean;
  reviewSource?: DocumentCandidateReviewSource;
}

function sanitizeDocumentCandidates(
  payload: DocumentCandidateLlmPayload[],
  originalCandidates: DocumentVocabCandidate[],
): DocumentVocabCandidate[] {
  const originalsById = new Map(originalCandidates.map((c) => [c.id, c]));
  const results: DocumentVocabCandidate[] = [];
  const seen = new Set<string>();

  for (const item of payload) {
    const original = item.id ? originalsById.get(item.id) : undefined;
    const surface = item.surface?.trim() || original?.surface;
    const normalized =
      item.normalized?.trim().toLowerCase() ||
      original?.normalized ||
      surface?.toLowerCase();

    if (!surface || !normalized || (!item.vocabType && !original?.vocabType)) {
      continue;
    }

    const vocabType = item.vocabType ?? original!.vocabType;
    const key = `${normalized}|${vocabType}|${item.sentenceIndex ?? original?.sentenceIndex ?? 0}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    results.push(
      new DocumentVocabCandidate(
        original?.id ?? crypto.randomUUID(),
        original?.documentId ?? originalCandidates[0].documentId,
        surface,
        normalized,
        item.lemma?.trim().toLowerCase() || original?.lemma || normalized,
        vocabType,
        item.pos ?? original?.pos ?? null,
        item.translation?.trim() ?? original?.translation ?? '',
        item.contextSentence?.trim() || original?.contextSentence || '',
        item.sentenceIndex ?? original?.sentenceIndex ?? 0,
        item.startOffset ?? original?.startOffset ?? 0,
        item.endOffset ?? original?.endOffset ?? 0,
        item.selectedByDefault ?? original?.selectedByDefault ?? true,
        original?.isDuplicate ?? false,
        item.reviewSource ?? (original ? original.reviewSource : 'llm_added'),
      ),
    );
  }

  return results.length > 0 ? results : originalCandidates;
}

@Injectable()
export class LmStudioCandidateEnricherService {
  constructor(
    private readonly client: ILmStudioChatPort,
    private readonly config: LMStudioConfig,
  ) {}

  async enrichDocumentCandidates(input: {
    markdown: string;
    candidates: DocumentVocabCandidate[];
    targetLang: string;
    nativeLang: string;
    llmReview: boolean;
  }): Promise<DocumentVocabCandidate[]> {
    if (input.candidates.length === 0) {
      return [];
    }

    const candidatesTable = input.candidates
      .map(
        (c, i) =>
          `| ${i + 1} | ${c.id} | ${c.surface} | ${c.normalized} | ${c.vocabType} | ${c.pos ?? 'null'} | ${c.contextSentence} |`,
      )
      .join('\n');

    const markdownSection = input.llmReview
      ? `\nSource markdown:\n"""\n${input.markdown}\n"""\n`
      : '';

    const userPrompt = `Target language: ${input.targetLang}
Native language: ${input.nativeLang}
LLM review enabled: ${input.llmReview ? 'yes' : 'no'}
${markdownSection}
Extracted candidates:
| # | id | surface | normalized | vocabType | pos | contextSentence |
|---|----|---------|------------|-----------|-----|-----------------|
${candidatesTable}`;

    const response = await this.client.chatCompletion(
      [
        { role: 'system', content: DOCUMENT_VOCAB_REVIEW_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      this.config.vocabularyModel,
      { temperature: input.llmReview ? 0.2 : 0.05, maxTokens: 4096 },
    );

    const parsed = parseJsonResponse<DocumentCandidateLlmPayload[]>(response);
    return sanitizeDocumentCandidates(parsed, input.candidates);
  }
}
