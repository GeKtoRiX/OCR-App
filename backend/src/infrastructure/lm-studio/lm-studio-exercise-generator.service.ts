import { Injectable } from '@nestjs/common';
import { GeneratedExercise } from '../../domain/ports/vocabulary-llm-service.port';
import { ILmStudioChatPort } from '../../domain/ports/lm-studio-chat.port';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';
import { LMStudioConfig } from '../config/lm-studio.config';
import { parseJsonResponse } from './lm-studio-vocabulary.utils';

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

@Injectable()
export class LmStudioExerciseGeneratorService {
  constructor(
    private readonly client: ILmStudioChatPort,
    private readonly config: LMStudioConfig,
  ) {}

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
      { temperature: 0.7, maxTokens: 4096 },
    );

    return parseJsonResponse<GeneratedExercise[]>(response);
  }
}
