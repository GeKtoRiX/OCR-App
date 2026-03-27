"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PracticeSession = void 0;
class PracticeSession {
    id;
    startedAt;
    completedAt;
    targetLang;
    nativeLang;
    totalExercises;
    correctCount;
    llmAnalysis;
    constructor(id, startedAt, completedAt, targetLang, nativeLang, totalExercises, correctCount, llmAnalysis) {
        this.id = id;
        this.startedAt = startedAt;
        this.completedAt = completedAt;
        this.targetLang = targetLang;
        this.nativeLang = nativeLang;
        this.totalExercises = totalExercises;
        this.correctCount = correctCount;
        this.llmAnalysis = llmAnalysis;
    }
}
exports.PracticeSession = PracticeSession;
//# sourceMappingURL=practice-session.entity.js.map