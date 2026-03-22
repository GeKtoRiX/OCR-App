import { Injectable } from '@nestjs/common';
import {
  GeneratedExercise,
  IVocabularyLlmService,
  SessionAnalysis,
} from '../../domain/ports/vocabulary-llm-service.port';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';
import { ExerciseAttempt } from '../../domain/entities/exercise-attempt.entity';

@Injectable()
export class StubVocabularyLlmService extends IVocabularyLlmService {
  async generateExercises(
    words: VocabularyWord[],
    count: number,
  ): Promise<GeneratedExercise[]> {
    const selectedWords = words.slice(0, Math.max(1, Math.min(words.length, count)));

    return selectedWords.map((word) => ({
      vocabularyId: word.id,
      word: word.word,
      exerciseType: 'spelling',
      prompt: `Type the ${word.targetLang} word for "${word.translation}".`,
      correctAnswer: word.word,
    }));
  }

  async analyzeSession(
    words: VocabularyWord[],
    attempts: ExerciseAttempt[],
  ): Promise<SessionAnalysis> {
    const totalExercises = attempts.length;
    const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
    const overallScore = totalExercises === 0
      ? 0
      : Math.round((correctCount / totalExercises) * 100);

    return {
      overallScore,
      summary: totalExercises === 0
        ? 'No practice attempts were recorded.'
        : `Smoke-mode analysis: ${correctCount}/${totalExercises} answers were correct.`,
      wordAnalyses: words.map((word) => {
        const relevantAttempts = attempts.filter((attempt) => attempt.vocabularyId === word.id);
        const wordCorrect = relevantAttempts.filter((attempt) => attempt.isCorrect).length;
        const ratio = relevantAttempts.length === 0 ? 0 : wordCorrect / relevantAttempts.length;

        return {
          vocabularyId: word.id,
          word: word.word,
          errorPattern: ratio >= 1 ? 'No recurring errors detected.' : 'Review the translation and spelling pair.',
          mnemonicSentence: `Remember "${word.word}" as "${word.translation}".`,
          difficultyAssessment: ratio >= 0.8 ? 'easy' : ratio >= 0.4 ? 'medium' : 'hard',
          suggestedFocus: `Practice ${word.word} -> ${word.translation} until recall is automatic.`,
        };
      }),
    };
  }
}
