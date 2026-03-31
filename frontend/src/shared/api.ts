import type {
  OcrResponse,
  HealthResponse,
  TtsSettings,
  SavedDocument,
  DocumentVocabCandidate,
  PreparedDocumentVocabularyResponse,
  ConfirmDocumentVocabularyResult,
  VocabularyWord,
  VocabType,
  Exercise,
  AnswerResult,
  SessionAnalysis,
} from './types';

const BASE = '/api';

async function getErrorMessage(response: Response): Promise<string> {
  const body = await response
    .json()
    .catch(() => ({ message: response.statusText }));
  return body.message ?? `HTTP ${response.status}`;
}

export async function processImage(
  file: File,
  signal?: AbortSignal,
): Promise<OcrResponse> {
  const form = new FormData();
  form.append('image', file);

  const res = await fetch(`${BASE}/ocr`, {
    method: 'POST',
    body: form,
    signal,
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }

  return res.json();
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`);

  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }

  return res.json();
}

export async function generateSpeech(
  text: string,
  settings: TtsSettings,
  signal?: AbortSignal,
): Promise<Blob> {
  const res = await fetch(`${BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...settings }),
    signal,
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }

  return res.blob();
}

export async function createDocument(
  markdown: string,
  filename: string,
): Promise<SavedDocument> {
  const res = await fetch(`${BASE}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, filename }),
  });
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function fetchDocuments(): Promise<SavedDocument[]> {
  const res = await fetch(`${BASE}/documents`);
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function fetchDocument(id: string): Promise<SavedDocument> {
  const res = await fetch(`${BASE}/documents/${id}`);
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function updateDocument(
  id: string,
  markdown: string,
): Promise<SavedDocument> {
  const res = await fetch(`${BASE}/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown }),
  });
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${BASE}/documents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await getErrorMessage(res));
}

export async function prepareDocumentVocabulary(input: {
  id: string;
  llmReview: boolean;
  targetLang: string;
  nativeLang: string;
  selectedCandidateIds?: string[];
}): Promise<PreparedDocumentVocabularyResponse> {
  const res = await fetch(`${BASE}/documents/${input.id}/vocabulary/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llmReview: input.llmReview,
      targetLang: input.targetLang,
      nativeLang: input.nativeLang,
      ...(input.selectedCandidateIds ? { selectedCandidateIds: input.selectedCandidateIds } : {}),
    }),
  });
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function confirmDocumentVocabulary(input: {
  id: string;
  targetLang: string;
  nativeLang: string;
  items: Array<{
    candidateId: string;
    word: string;
    vocabType: VocabType;
    translation: string;
    contextSentence: string;
  }>;
}): Promise<ConfirmDocumentVocabularyResult> {
  const res = await fetch(`${BASE}/documents/${input.id}/vocabulary/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetLang: input.targetLang,
      nativeLang: input.nativeLang,
      items: input.items,
    }),
  });
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

// ── Vocabulary API ──

export async function addVocabularyWord(input: {
  word: string;
  vocabType: VocabType;
  translation: string;
  targetLang: string;
  nativeLang: string;
  contextSentence: string;
  sourceDocumentId?: string;
}): Promise<VocabularyWord> {
  const res = await fetch(`${BASE}/vocabulary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function fetchVocabulary(
  targetLang?: string,
  nativeLang?: string,
): Promise<VocabularyWord[]> {
  const params = new URLSearchParams();
  if (targetLang) params.set('targetLang', targetLang);
  if (nativeLang) params.set('nativeLang', nativeLang);
  const qs = params.toString();
  const res = await fetch(`${BASE}/vocabulary${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function fetchDueVocabulary(
  limit?: number,
): Promise<VocabularyWord[]> {
  const qs = limit ? `?limit=${limit}` : '';
  const res = await fetch(`${BASE}/vocabulary/review/due${qs}`);
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function updateVocabularyWord(
  id: string,
  translation: string,
  contextSentence: string,
): Promise<VocabularyWord> {
  const res = await fetch(`${BASE}/vocabulary/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ translation, contextSentence }),
  });
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function deleteVocabularyWord(id: string): Promise<void> {
  const res = await fetch(`${BASE}/vocabulary/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await getErrorMessage(res));
}

// ── Practice API ──

export async function startPractice(input?: {
  targetLang?: string;
  nativeLang?: string;
  wordLimit?: number;
}): Promise<{ sessionId: string; exercises: Exercise[] }> {
  const res = await fetch(`${BASE}/practice/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input ?? {}),
  });
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function submitAnswer(input: {
  sessionId: string;
  vocabularyId: string;
  exerciseType: string;
  prompt: string;
  correctAnswer: string;
  userAnswer: string;
}): Promise<AnswerResult> {
  const res = await fetch(`${BASE}/practice/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export async function completePractice(
  sessionId: string,
): Promise<SessionAnalysis> {
  const res = await fetch(`${BASE}/practice/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}
