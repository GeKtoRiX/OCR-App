"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VocabularyWord = void 0;
class VocabularyWord {
    id;
    word;
    vocabType;
    translation;
    targetLang;
    nativeLang;
    contextSentence;
    sourceDocumentId;
    createdAt;
    updatedAt;
    intervalDays;
    easinessFactor;
    repetitions;
    nextReviewAt;
    constructor(id, word, vocabType, translation, targetLang, nativeLang, contextSentence, sourceDocumentId, createdAt, updatedAt, intervalDays, easinessFactor, repetitions, nextReviewAt) {
        this.id = id;
        this.word = word;
        this.vocabType = vocabType;
        this.translation = translation;
        this.targetLang = targetLang;
        this.nativeLang = nativeLang;
        this.contextSentence = contextSentence;
        this.sourceDocumentId = sourceDocumentId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.intervalDays = intervalDays;
        this.easinessFactor = easinessFactor;
        this.repetitions = repetitions;
        this.nextReviewAt = nextReviewAt;
    }
}
exports.VocabularyWord = VocabularyWord;
//# sourceMappingURL=vocabulary-word.entity.js.map