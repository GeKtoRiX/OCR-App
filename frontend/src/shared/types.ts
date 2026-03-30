export interface OcrLine {
  text: string;
  bbox: number[];
  confidence?: number;
}

export interface OcrBlock {
  type: string;
  bbox: number[];
  text: string;
  html?: string;
  lines?: OcrLine[];
  score?: number | null;
}

export interface OcrResponse {
  rawText: string;
  markdown: string;
  filename: string;
  blocks?: OcrBlock[];
}

export interface HealthResponse {
  ocrReachable: boolean;
  ocrModels: string[];
  ocrDevice: 'gpu' | 'cpu' | null;
  lmStudioReachable: boolean;
  lmStudioModels: string[];
  superToneReachable: boolean;
  kokoroReachable: boolean;
  f5TtsReachable: boolean;
  f5TtsDevice: 'gpu' | 'cpu' | null;
  voxtralReachable: boolean;
  voxtralDevice: 'gpu' | 'cpu' | null;
}

export interface ApiError {
  statusCode: number;
  message: string;
}

export type TtsEngine = 'supertone' | 'piper' | 'kokoro' | 'f5' | 'voxtral';

export interface SupertoneTtsSettings {
  engine: 'supertone';
  voice: string;
  lang: string;
  speed: number;
  totalSteps: number;
}

export interface PiperTtsSettings {
  engine: 'piper';
  voice: string;
  speed: number;
}

export interface KokoroTtsSettings {
  engine: 'kokoro';
  voice: string;
  speed: number;
}

export interface F5TtsSettings {
  engine: 'f5';
  refText: string;
  refAudioFile: File | null;
  autoTranscribe: boolean;
  removeSilence: boolean;
}

export interface VoxtralTtsSettings {
  engine: 'voxtral';
  voice: string;
  format: 'wav';
}

export type TtsSettings =
  | SupertoneTtsSettings
  | PiperTtsSettings
  | KokoroTtsSettings
  | F5TtsSettings
  | VoxtralTtsSettings;

// Supertone voices
export const TTS_VOICES = ['M1', 'M2', 'M3', 'M4', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5'] as const;
export const TTS_LANGS = ['en', 'ko', 'es', 'pt', 'fr'] as const;
export const TTS_LANG_LABELS: Record<string, string> = {
  en: 'English', ko: 'Korean', es: 'Spanish', pt: 'Portuguese', fr: 'French',
};

// Piper voices (auto-downloaded from HuggingFace on first use)
export const PIPER_VOICES = [
  { id: 'en_US-hfc_female-medium', label: 'HFC Female', lang: 'en-US' },
  { id: 'en_US-lessac-high',       label: 'Lessac',     lang: 'en-US' },
  { id: 'en_US-ryan-high',         label: 'Ryan',       lang: 'en-US' },
  { id: 'en_US-ljspeech-high',     label: 'LJSpeech',   lang: 'en-US' },
  { id: 'en_US-amy-medium',        label: 'Amy',        lang: 'en-US' },
] as const;

// Kokoro voices — hexgrad/kokoro (local sidecar, port 8200)
export const KOKORO_VOICES = [
  { id: 'af_heart',    label: 'Heart',    lang: 'en-US', gender: 'F' },
  { id: 'af_bella',    label: 'Bella',    lang: 'en-US', gender: 'F' },
  { id: 'af_nicole',   label: 'Nicole',   lang: 'en-US', gender: 'F' },
  { id: 'am_fenrir',   label: 'Fenrir',   lang: 'en-US', gender: 'M' },
  { id: 'am_michael',  label: 'Michael',  lang: 'en-US', gender: 'M' },
  { id: 'bf_emma',     label: 'Emma',     lang: 'en-GB', gender: 'F' },
  { id: 'bm_fable',    label: 'Fable',    lang: 'en-GB', gender: 'M' },
] as const;

export const VOXTRAL_VOICES = [
  { id: 'casual_female', label: 'Casual', meta: 'EN • F' },
  { id: 'casual_male', label: 'Casual', meta: 'EN • M' },
  { id: 'cheerful_female', label: 'Cheerful', meta: 'EN • F' },
  { id: 'neutral_female', label: 'Neutral', meta: 'EN • F' },
  { id: 'neutral_male', label: 'Neutral', meta: 'EN • M' },
  { id: 'ar_male', label: 'Arabic', meta: 'AR • M' },
  { id: 'de_female', label: 'German', meta: 'DE • F' },
  { id: 'de_male', label: 'German', meta: 'DE • M' },
  { id: 'es_female', label: 'Spanish', meta: 'ES • F' },
  { id: 'es_male', label: 'Spanish', meta: 'ES • M' },
  { id: 'fr_female', label: 'French', meta: 'FR • F' },
  { id: 'fr_male', label: 'French', meta: 'FR • M' },
  { id: 'hi_female', label: 'Hindi', meta: 'HI • F' },
  { id: 'hi_male', label: 'Hindi', meta: 'HI • M' },
  { id: 'it_female', label: 'Italian', meta: 'IT • F' },
  { id: 'it_male', label: 'Italian', meta: 'IT • M' },
  { id: 'nl_female', label: 'Dutch', meta: 'NL • F' },
  { id: 'nl_male', label: 'Dutch', meta: 'NL • M' },
  { id: 'pt_female', label: 'Portuguese', meta: 'PT • F' },
  { id: 'pt_male', label: 'Portuguese', meta: 'PT • M' },
] as const;

export const VOXTRAL_EN_VOICES = VOXTRAL_VOICES.filter((voice) => voice.meta.startsWith('EN'));

export interface SavedDocument {
  id: string;
  markdown: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
  analysisStatus: 'idle' | 'pending' | 'ready' | 'failed';
  analysisError: string | null;
  analysisUpdatedAt: string | null;
}

export type DocumentCandidatePos = 'noun' | 'verb' | 'adjective' | 'adverb' | null;
export type DocumentCandidateReviewSource =
  | 'base_nlp'
  | 'llm_added'
  | 'llm_reclassified';

export interface HistoryEntry {
  id: string;
  type: 'image' | 'text';
  file?: File;
  result: OcrResponse;
  processedAt: Date;
}

// Vocabulary types
export type VocabType =
  | 'word'
  | 'phrasal_verb'
  | 'idiom'
  | 'collocation'
  | 'expression';

export const VOCAB_TYPE_LABELS: Record<VocabType, string> = {
  word: 'Word',
  phrasal_verb: 'Phrasal Verb',
  idiom: 'Idiom',
  collocation: 'Collocation',
  expression: 'Expression',
};

export interface VocabularyWord {
  id: string;
  word: string;
  vocabType: VocabType;
  translation: string;
  targetLang: string;
  nativeLang: string;
  contextSentence: string;
  sourceDocumentId: string | null;
  intervalDays: number;
  easinessFactor: number;
  repetitions: number;
  nextReviewAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVocabCandidate {
  id: string;
  surface: string;
  normalized: string;
  lemma: string;
  vocabType: VocabType;
  pos: DocumentCandidatePos;
  translation: string;
  contextSentence: string;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
  selectedByDefault: boolean;
  isDuplicate: boolean;
  reviewSource: DocumentCandidateReviewSource;
}

export interface PreparedDocumentVocabularyResponse {
  document: SavedDocument;
  candidates: DocumentVocabCandidate[];
  llmReviewApplied: boolean;
}

export interface ConfirmDocumentVocabularyResult {
  savedCount: number;
  skippedDuplicateCount: number;
  failedCount: number;
  savedItems: Array<{
    candidateId: string;
    vocabularyId: string;
    word: string;
  }>;
  skippedItems: Array<{
    candidateId: string;
    word: string;
    reason: 'duplicate' | 'missing_candidate';
  }>;
  failedItems: Array<{
    candidateId: string;
    word: string;
    reason: string;
  }>;
}

export interface Exercise {
  vocabularyId: string;
  word: string;
  exerciseType: 'fill_blank' | 'spelling' | 'context_sentence' | 'multiple_choice';
  prompt: string;
  correctAnswer: string;
  options?: string[];
}

export interface AnswerResult {
  isCorrect: boolean;
  errorPosition: string | null;
  qualityRating: number;
}

export interface SessionAnalysis {
  sessionId: string;
  overallScore: number;
  summary: string;
  totalExercises: number;
  correctCount: number;
  wordAnalyses: Array<{
    vocabularyId: string;
    word: string;
    errorPattern: string;
    mnemonicSentence: string;
    difficultyAssessment: string;
    suggestedFocus: string;
  }>;
}

export interface LanguagePair {
  targetLang: string;
  nativeLang: string;
}
