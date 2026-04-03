import type {
  VocabType,
  VocabularyWordPos,
} from '../../domain/entities/vocabulary-word.entity';

const VERB_HINTS = new Set([
  'be', 'become', 'break', 'bring', 'build', 'call', 'come', 'do', 'find', 'get',
  'give', 'go', 'have', 'hit', 'keep', 'know', 'learn', 'look', 'make', 'move',
  'pick', 'put', 'read', 'run', 'save', 'say', 'see', 'set', 'show', 'speak', 'take',
  'turn', 'use', 'walk', 'work', 'write',
]);

export function guessVocabularyPos(word: string): VocabularyWordPos {
  const normalizedWord = word.trim().toLowerCase();

  if (!normalizedWord) {
    return null;
  }

  if (normalizedWord.endsWith('ly')) {
    return 'adverb';
  }
  if (
    VERB_HINTS.has(normalizedWord) ||
    normalizedWord.endsWith('ing') ||
    normalizedWord.endsWith('ed')
  ) {
    return 'verb';
  }
  if (
    normalizedWord.endsWith('ous') ||
    normalizedWord.endsWith('ful') ||
    normalizedWord.endsWith('ive') ||
    normalizedWord.endsWith('al') ||
    normalizedWord.endsWith('able') ||
    normalizedWord.endsWith('ible') ||
    normalizedWord.endsWith('less') ||
    normalizedWord.endsWith('ic')
  ) {
    return 'adjective';
  }
  return 'noun';
}

export function inferVocabularyPosForBackfill(
  word: string,
  vocabType: VocabType,
): VocabularyWordPos {
  if (vocabType === 'phrasal_verb') {
    return 'verb';
  }
  if (vocabType === 'word') {
    return guessVocabularyPos(word);
  }
  return null;
}
