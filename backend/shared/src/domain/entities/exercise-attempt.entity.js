"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExerciseAttempt = void 0;
class ExerciseAttempt {
    id;
    sessionId;
    vocabularyId;
    exerciseType;
    prompt;
    correctAnswer;
    userAnswer;
    isCorrect;
    errorPosition;
    qualityRating;
    mnemonicSentence;
    createdAt;
    constructor(id, sessionId, vocabularyId, exerciseType, prompt, correctAnswer, userAnswer, isCorrect, errorPosition, qualityRating, mnemonicSentence, createdAt) {
        this.id = id;
        this.sessionId = sessionId;
        this.vocabularyId = vocabularyId;
        this.exerciseType = exerciseType;
        this.prompt = prompt;
        this.correctAnswer = correctAnswer;
        this.userAnswer = userAnswer;
        this.isCorrect = isCorrect;
        this.errorPosition = errorPosition;
        this.qualityRating = qualityRating;
        this.mnemonicSentence = mnemonicSentence;
        this.createdAt = createdAt;
    }
}
exports.ExerciseAttempt = ExerciseAttempt;
//# sourceMappingURL=exercise-attempt.entity.js.map