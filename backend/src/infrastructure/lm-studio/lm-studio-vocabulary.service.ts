import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IVocabularyLlmService,
  GeneratedExercise,
  SessionAnalysis,
} from '../../domain/ports/vocabulary-llm-service.port';
import { ILmStudioChatPort } from '../../domain/ports/lm-studio-chat.port';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';
import { ExerciseAttempt } from '../../domain/entities/exercise-attempt.entity';
import { LMStudioConfig } from '../config/lm-studio.config';
import { DocumentVocabCandidate } from '../../domain/entities/document-vocab-candidate.entity';
import type {
  DocumentCandidatePos,
  DocumentCandidateReviewSource,
} from '../../domain/entities/document-vocab-candidate.entity';
import type { VocabType } from '../../domain/entities/vocabulary-word.entity';

const EXERCISE_SYSTEM_PROMPT = `You are a vocabulary exercise generator for language learners. Given a list of vocabulary words with their translations and context, generate diverse exercises.

## Exercise types
1. **fill_blank** — A sentence with the target word replaced by "___". The learner types the missing word.
2. **spelling** — Show the translation in the native language. The learner types the word in the target language.
3. **context_sentence** — Give a definition or description. The learner types the word that matches.
4. **multiple_choice** — A sentence or definition with 4 options. Only one is correct.

## Rules
- Each word should appear in at least 1 exercise, ideally 2 different types.
- Fill-in-blank sentences must be natural, level-appropriate, and use the word in a realistic context.
- Multiple-choice distractors must be plausible but clearly wrong.
- Spelling prompts show the native language translation; the correct answer is the target language word.
- NEVER include the answer in the prompt text.
- Output ONLY valid JSON, no preamble or explanation.

## Output format
Return a JSON array:
[
  {
    "vocabularyId": "<uuid>",
    "word": "<target word>",
    "exerciseType": "fill_blank",
    "prompt": "The cat sat on the ___.",
    "correctAnswer": "mat"
  },
  {
    "vocabularyId": "<uuid>",
    "word": "<target word>",
    "exerciseType": "multiple_choice",
    "prompt": "Which word means 'a floor covering'?",
    "correctAnswer": "mat",
    "options": ["mat", "hat", "bat", "map"]
  }
]`;

const SESSION_ANALYSIS_SYSTEM_PROMPT = `You are a language learning analyst. After a practice session, you analyze the learner's performance and provide structured feedback.

## Input
You receive:
- A list of vocabulary words being practiced
- A list of exercise attempts with the correct answer, user answer, whether it was correct, and error position

## Your analysis tasks
1. Identify error patterns for each word (e.g., "consistently misspells double consonants")
2. Create a mnemonic sentence for each word that helps remember spelling/meaning
3. Assess difficulty: easy (>80% correct), medium (40-80%), hard (<40%)
4. Suggest specific focus areas (e.g., "practice the '-tion' suffix")
5. Compute an overall session score (0-100)
6. Write a brief encouraging summary (2-3 sentences)

## Rules
- Mnemonic sentences should be memorable, using wordplay, rhyme, or vivid imagery
- Error patterns should be specific and actionable
- Output ONLY valid JSON, no preamble or explanation

## Output format
{
  "overallScore": 72,
  "summary": "Good effort! You nailed the fill-in-blank exercises but spelling needs work.",
  "wordAnalyses": [
    {
      "vocabularyId": "<uuid>",
      "word": "beautiful",
      "errorPattern": "Drops the 'u' after 'bea'",
      "mnemonicSentence": "Big Elephants Are Ugly — B-E-A-U-T-I-F-U-L",
      "difficultyAssessment": "hard",
      "suggestedFocus": "Practice the 'eau' trigraph"
    }
  ]
}`;

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

@Injectable()
export class LMStudioVocabularyService extends IVocabularyLlmService {
  constructor(
    private readonly client: ILmStudioChatPort,
    private readonly config: LMStudioConfig,
  ) {
    super();
  }

  async generateExercises(
    words: VocabularyWord[],
    count: number,
  ): Promise<GeneratedExercise[]> {
    const wordsTable = words
      .map(
        (w, i) =>
          `| ${i + 1} | ${w.word} | ${w.translation} | ${w.contextSentence} | ${w.id} |`,
      )
      .join('\n');
    const targetLang = words[0]?.targetLang ?? 'en';
    const nativeLang = words[0]?.nativeLang ?? 'ru';

    const userPrompt = `Generate exercises for these vocabulary words (target language: ${targetLang}, native language: ${nativeLang}):

| # | Word | Translation | Context | ID |
|---|------|-------------|---------|-----|
${wordsTable}

Generate ${count} exercises total, mixing all four exercise types. Each word must appear at least once.`;

    const response = await this.client.chatCompletion(
      [
        { role: 'system', content: EXERCISE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      this.config.vocabularyModel,
      {
        temperature: 0.7,
        maxTokens: 4096,
      },
    );

    return parseJsonResponse<GeneratedExercise[]>(response);
  }

  async analyzeSession(
    words: VocabularyWord[],
    attempts: ExerciseAttempt[],
  ): Promise<SessionAnalysis> {
    const wordsTable = words
      .map(
        (w, i) =>
          `| ${i + 1} | ${w.word} | ${w.translation} | ${w.targetLang} -> ${w.nativeLang} | ${w.id} |`,
      )
      .join('\n');

    const attemptsTable = attempts
      .map(
        (a, i) =>
          `| ${i + 1} | ${a.vocabularyId} | ${a.exerciseType} | ${a.correctAnswer} | ${a.userAnswer} | ${a.isCorrect ? 'Yes' : 'No'} | ${a.errorPosition ?? 'N/A'} |`,
      )
      .join('\n');

    const userPrompt = `Analyze this practice session:

## Vocabulary words
| # | Word | Translation | Lang pair | ID |
|---|------|-------------|-----------|-----|
${wordsTable}

## Exercise attempts
| # | Vocab ID | Type | Correct answer | User answer | Correct? | Error position |
|---|----------|------|---------------|-------------|----------|----------------|
${attemptsTable}

Provide your analysis.`;

    const response = await this.client.chatCompletion(
      [
        { role: 'system', content: SESSION_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      this.config.vocabularyModel,
      {
        temperature: 0.3,
        maxTokens: 4096,
      },
    );

    return parseJsonResponse<SessionAnalysis>(response);
  }

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
        (candidate, index) =>
          `| ${index + 1} | ${candidate.id} | ${candidate.surface} | ${candidate.normalized} | ${candidate.vocabType} | ${candidate.pos ?? 'null'} | ${candidate.contextSentence} |`,
      )
      .join('\n');

    const userPrompt = `Target language: ${input.targetLang}
Native language: ${input.nativeLang}
LLM review enabled: ${input.llmReview ? 'yes' : 'no'}

Source markdown:
"""
${input.markdown}
"""

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
      {
        temperature: input.llmReview ? 0.2 : 0.05,
        maxTokens: 4096,
      },
    );

    const parsed = parseJsonResponse<DocumentCandidateLlmPayload[]>(response);
    return sanitizeDocumentCandidates(parsed, input.candidates);
  }
}

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
  const originalsById = new Map(originalCandidates.map((candidate) => [candidate.id, candidate]));
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

export function parseJsonResponse<T>(response: string): T {
  // Try direct parse
  try {
    return JSON.parse(response) as T;
  } catch {
    // ignore
  }

  // Try extracting from markdown code fences
  const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]) as T;
    } catch {
      // ignore
    }
  }

  // Try extracting first JSON array or object
  const jsonMatch = response.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch {
      // ignore
    }
  }

  throw new Error(`Failed to parse LLM response as JSON: ${response.slice(0, 200)}`);
}
