import { Injectable } from '@nestjs/common';
import { SessionAnalysis } from '../../domain/ports/vocabulary-llm-service.port';
import { ILmStudioChatPort } from '../../domain/ports/lm-studio-chat.port';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';
import { ExerciseAttempt } from '../../domain/entities/exercise-attempt.entity';
import { LMStudioConfig } from '../config/lm-studio.config';
import { parseJsonResponse } from './lm-studio-vocabulary.utils';

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
export class LmStudioSessionAnalyzerService {
  constructor(
    private readonly client: ILmStudioChatPort,
    private readonly config: LMStudioConfig,
  ) {}

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
      { temperature: 0.3, maxTokens: 4096 },
    );

    return parseJsonResponse<SessionAnalysis>(response);
  }
}
