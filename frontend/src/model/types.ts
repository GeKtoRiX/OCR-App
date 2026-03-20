export interface OcrResponse {
  rawText: string;
  markdown: string;
  filename: string;
}

export interface HealthResponse {
  paddleOcrReachable: boolean;
  paddleOcrModels: string[];
  paddleOcrDevice: 'gpu' | 'cpu' | null;
  lmStudioReachable: boolean;
  lmStudioModels: string[];
  superToneReachable: boolean;
  kokoroReachable: boolean;
  qwenTtsReachable: boolean;
  qwenTtsDevice: 'gpu' | 'cpu' | null;
}

export interface ApiError {
  statusCode: number;
  message: string;
}

export type TtsEngine = 'supertone' | 'piper' | 'kokoro' | 'qwen';

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

export interface QwenTtsSettings {
  engine: 'qwen';
  lang: string;
  speaker: string;
  instruct: string;
}

export type TtsSettings =
  | SupertoneTtsSettings
  | PiperTtsSettings
  | KokoroTtsSettings
  | QwenTtsSettings;

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
  // American English — Female
  { id: 'af_heart',    label: 'Heart',    lang: 'en-US', gender: 'F' },
  { id: 'af_alloy',    label: 'Alloy',    lang: 'en-US', gender: 'F' },
  { id: 'af_aoede',    label: 'Aoede',    lang: 'en-US', gender: 'F' },
  { id: 'af_bella',    label: 'Bella',    lang: 'en-US', gender: 'F' },
  { id: 'af_jessica',  label: 'Jessica',  lang: 'en-US', gender: 'F' },
  { id: 'af_kore',     label: 'Kore',     lang: 'en-US', gender: 'F' },
  { id: 'af_nicole',   label: 'Nicole',   lang: 'en-US', gender: 'F' },
  { id: 'af_nova',     label: 'Nova',     lang: 'en-US', gender: 'F' },
  { id: 'af_river',    label: 'River',    lang: 'en-US', gender: 'F' },
  { id: 'af_sarah',    label: 'Sarah',    lang: 'en-US', gender: 'F' },
  { id: 'af_sky',      label: 'Sky',      lang: 'en-US', gender: 'F' },
  // American English — Male
  { id: 'am_adam',     label: 'Adam',     lang: 'en-US', gender: 'M' },
  { id: 'am_echo',     label: 'Echo',     lang: 'en-US', gender: 'M' },
  { id: 'am_eric',     label: 'Eric',     lang: 'en-US', gender: 'M' },
  { id: 'am_fenrir',   label: 'Fenrir',   lang: 'en-US', gender: 'M' },
  { id: 'am_liam',     label: 'Liam',     lang: 'en-US', gender: 'M' },
  { id: 'am_michael',  label: 'Michael',  lang: 'en-US', gender: 'M' },
  { id: 'am_onyx',     label: 'Onyx',     lang: 'en-US', gender: 'M' },
  { id: 'am_puck',     label: 'Puck',     lang: 'en-US', gender: 'M' },
  { id: 'am_santa',    label: 'Santa',    lang: 'en-US', gender: 'M' },
  // British English — Female
  { id: 'bf_alice',    label: 'Alice',    lang: 'en-GB', gender: 'F' },
  { id: 'bf_emma',     label: 'Emma',     lang: 'en-GB', gender: 'F' },
  { id: 'bf_isabella', label: 'Isabella', lang: 'en-GB', gender: 'F' },
  { id: 'bf_lily',     label: 'Lily',     lang: 'en-GB', gender: 'F' },
  // British English — Male
  { id: 'bm_daniel',   label: 'Daniel',   lang: 'en-GB', gender: 'M' },
  { id: 'bm_fable',    label: 'Fable',    lang: 'en-GB', gender: 'M' },
  { id: 'bm_george',   label: 'George',   lang: 'en-GB', gender: 'M' },
  { id: 'bm_lewis',    label: 'Lewis',    lang: 'en-GB', gender: 'M' },
] as const;

export const QWEN_TTS_LANGS = [
  'Auto',
  'Chinese',
  'English',
  'Japanese',
  'Korean',
  'German',
  'French',
  'Russian',
  'Portuguese',
  'Spanish',
  'Italian',
] as const;

export const QWEN_TTS_SPEAKERS = [
  { id: 'Vivian', label: 'Vivian', lang: 'Chinese' },
  { id: 'Serena', label: 'Serena', lang: 'Chinese' },
  { id: 'Uncle_Fu', label: 'Uncle Fu', lang: 'Chinese' },
  { id: 'Dylan', label: 'Dylan', lang: 'Chinese' },
  { id: 'Eric', label: 'Eric', lang: 'Chinese' },
  { id: 'Ryan', label: 'Ryan', lang: 'English' },
  { id: 'Aiden', label: 'Aiden', lang: 'English' },
  { id: 'Ono_Anna', label: 'Ono Anna', lang: 'Japanese' },
  { id: 'Sohee', label: 'Sohee', lang: 'Korean' },
] as const;

export interface SavedDocument {
  id: string;
  markdown: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  file: File;
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
