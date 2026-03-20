import { Injectable } from '@nestjs/common';
import {
  IVocabularyLlmService,
  GeneratedExercise,
  SessionAnalysis,
} from '../../domain/ports/vocabulary-llm-service.port';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';
import { ExerciseAttempt } from '../../domain/entities/exercise-attempt.entity';
import { LMStudioClient } from './lm-studio.client';
import { LMStudioConfig } from '../config/lm-studio.config';

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

@Injectable()
export class LMStudioVocabularyService extends IVocabularyLlmService {
  constructor(
    private readonly client: LMStudioClient,
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

    const response = await this.client.chatCompletion({
      model: this.config.structuringModel,
      messages: [
        { role: 'system', content: EXERCISE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    });

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

    const response = await this.client.chatCompletion({
      model: this.config.structuringModel,
      messages: [
        { role: 'system', content: SESSION_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });

    return parseJsonResponse<SessionAnalysis>(response);
  }
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
