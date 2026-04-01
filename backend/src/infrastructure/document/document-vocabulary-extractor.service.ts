import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { fetchWithRetry } from '../http/fetch-with-retry';
import {
  ExtractDocumentVocabularyInput,
  IDocumentVocabularyExtractor,
} from '../../domain/ports/document-vocabulary-extractor.port';
import { DocumentVocabCandidate } from '../../domain/entities/document-vocab-candidate.entity';
import type { DocumentCandidatePos } from '../../domain/entities/document-vocab-candidate.entity';

interface StanzaCandidatePayload {
  surface: string;
  normalized: string;
  lemma: string;
  vocabType: 'word' | 'phrasal_verb' | 'idiom' | 'collocation';
  pos: DocumentCandidatePos;
  contextSentence: string;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
  selectedByDefault?: boolean;
}

const STANZA_SERVICE_URL =
  process.env.STANZA_SERVICE_URL ?? 'http://127.0.0.1:8501/extract';
const STANZA_TIMEOUT_MS = parseInt(process.env.STANZA_SERVICE_TIMEOUT ?? '10000', 10);

const BERT_SERVICE_URL =
  process.env.BERT_SERVICE_URL ?? 'http://127.0.0.1:8502/score';
const BERT_TIMEOUT_MS = parseInt(process.env.BERT_SERVICE_TIMEOUT ?? '15000', 10);

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'for',
  'from', 'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'i', 'if', 'in',
  'into', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'ours', 'she',
  'that', 'the', 'their', 'them', 'they', 'this', 'those', 'to', 'was', 'we', 'were',
  'with', 'you', 'your',
]);
const VERB_HINTS = new Set([
  'be', 'become', 'break', 'bring', 'build', 'call', 'come', 'do', 'find', 'get',
  'give', 'go', 'have', 'hit', 'keep', 'know', 'learn', 'look', 'make', 'move',
  'pick', 'put', 'read', 'run', 'save', 'say', 'see', 'set', 'show', 'speak', 'take',
  'turn', 'use', 'walk', 'work', 'write',
]);
const PARTICLES = new Set([
  'up', 'down', 'out', 'off', 'in', 'on', 'over', 'away', 'back', 'after', 'through',
  'into', 'around',
]);
const IDIOMS = [
  'break the ice',
  'hit the books',
  'piece of cake',
  'under the weather',
  'spill the beans',
  'once in a blue moon',
  'cost an arm and a leg',
];

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>-]/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text: string): Array<{ text: string; start: number }> {
  const matches = Array.from(text.matchAll(/[^.!?\n]+[.!?\n]?/g));
  return matches
    .map((match) => ({
      text: match[0].trim(),
      start: match.index ?? 0,
    }))
    .filter((sentence) => sentence.text.length > 0);
}

function guessPos(word: string): DocumentCandidatePos {
  if (word.endsWith('ly')) return 'adverb';
  if (
    VERB_HINTS.has(word) ||
    word.endsWith('ing') ||
    word.endsWith('ed')
  ) {
    return 'verb';
  }
  if (
    word.endsWith('ous') ||
    word.endsWith('ful') ||
    word.endsWith('ive') ||
    word.endsWith('al') ||
    word.endsWith('able') ||
    word.endsWith('ible') ||
    word.endsWith('less') ||
    word.endsWith('ic')
  ) {
    return 'adjective';
  }
  return 'noun';
}

// Irregular noun forms: plural → singular
const IRREGULAR_NOUNS: Record<string, string> = {
  children: 'child', men: 'man', women: 'woman', feet: 'foot',
  teeth: 'tooth', mice: 'mouse', geese: 'goose', oxen: 'ox',
  people: 'person', leaves: 'leaf', knives: 'knife', wives: 'wife',
  lives: 'life', shelves: 'shelf', loaves: 'loaf', thieves: 'thief',
  scarves: 'scarf', calves: 'calf', halves: 'half', wolves: 'wolf',
  selves: 'self', elves: 'elf', alumni: 'alumnus', cacti: 'cactus',
  syllabi: 'syllabus', foci: 'focus', fungi: 'fungus', nuclei: 'nucleus',
  data: 'datum', criteria: 'criterion', phenomena: 'phenomenon',
  analyses: 'analysis', bases: 'basis', crises: 'crisis',
  diagnoses: 'diagnosis', hypotheses: 'hypothesis', theses: 'thesis',
};

function lemmaFor(word: string, pos: DocumentCandidatePos): string {
  if (pos === 'noun') {
    if (IRREGULAR_NOUNS[word]) {
      return IRREGULAR_NOUNS[word];
    }
    // Regular plurals: -ies → -y, -ves → -f, -es/-s → base
    if (word.endsWith('ies') && word.length > 4) {
      return word.slice(0, -3) + 'y';
    }
    if (word.endsWith('ves') && word.length > 4) {
      return word.slice(0, -3) + 'f';
    }
    if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') ||
        word.endsWith('ches') || word.endsWith('shes')) {
      return word.slice(0, -2);
    }
    if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) {
      return word.slice(0, -1);
    }
  }
  if (pos === 'verb') {
    if (word.endsWith('ing') && word.length > 5) {
      return word.slice(0, -3);
    }
    if (word.endsWith('ed') && word.length > 4) {
      return word.slice(0, -2);
    }
    if (word.endsWith('es') && word.length > 4) {
      return word.slice(0, -2);
    }
    if (word.endsWith('s') && word.length > 3) {
      return word.slice(0, -1);
    }
  }
  if (pos === 'adverb' && word.endsWith('ly') && word.length > 4) {
    return word.slice(0, -2);
  }
  return word;
}

function buildCandidate(
  documentId: string,
  payload: StanzaCandidatePayload,
): DocumentVocabCandidate {
  return new DocumentVocabCandidate(
    crypto.randomUUID(),
    documentId,
    payload.surface,
    payload.normalized,
    payload.lemma,
    payload.vocabType,
    payload.pos,
    '',
    payload.contextSentence,
    payload.sentenceIndex,
    payload.startOffset,
    payload.endOffset,
    payload.selectedByDefault ?? true,
    false,
    'base_nlp',
  );
}

export function extractHeuristicDocumentVocabulary(
  input: ExtractDocumentVocabularyInput,
): DocumentVocabCandidate[] {
  const plainText = stripMarkdown(input.markdown);
  const sentences = splitSentences(plainText);
  const candidates: DocumentVocabCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (payload: StanzaCandidatePayload) => {
    const key = `${payload.normalized}|${payload.vocabType}|${payload.sentenceIndex}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(buildCandidate(input.documentId, payload));
  };

  for (const idiom of IDIOMS) {
    const start = plainText.toLowerCase().indexOf(idiom);
    if (start !== -1) {
      const sentenceIndex = sentences.findIndex(
        (sentence) =>
          start >= sentence.start &&
          start < sentence.start + sentence.text.length + 1,
      );
      const sentence = sentences[sentenceIndex] ?? { text: plainText, start: 0 };
      addCandidate({
        surface: plainText.slice(start, start + idiom.length),
        normalized: idiom,
        lemma: idiom,
        vocabType: 'idiom',
        pos: null,
        contextSentence: sentence.text,
        sentenceIndex: Math.max(sentenceIndex, 0),
        startOffset: start,
        endOffset: start + idiom.length,
      });
    }
  }

  sentences.forEach((sentence, sentenceIndex) => {
    const tokens = Array.from(
      sentence.text.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/g),
    ).map((match) => ({
      surface: match[0],
      normalized: match[0].toLowerCase(),
      start: sentence.start + (match.index ?? 0),
      end: sentence.start + (match.index ?? 0) + match[0].length,
    }));

    tokens.forEach((token, index) => {
      if (STOP_WORDS.has(token.normalized) || token.normalized.length < 3) {
        return;
      }

      const pos = guessPos(token.normalized);
      if (!pos) {
        return;
      }

      const lemma = lemmaFor(token.normalized, pos);
      addCandidate({
        surface: token.surface,
        normalized: lemma,
        lemma,
        vocabType: 'word',
        pos,
        contextSentence: sentence.text,
        sentenceIndex,
        startOffset: token.start,
        endOffset: token.end,
      });

      const next = tokens[index + 1];
      if (pos === 'verb' && next && PARTICLES.has(next.normalized)) {
        addCandidate({
          surface: `${token.surface} ${next.surface}`,
          normalized: `${lemma} ${next.normalized}`,
          lemma: `${lemma} ${next.normalized}`,
          vocabType: 'phrasal_verb',
          pos: 'verb',
          contextSentence: sentence.text,
          sentenceIndex,
          startOffset: token.start,
          endOffset: next.end,
        });
      }
    });
  });

  return candidates;
}

@Injectable()
export class DocumentVocabularyExtractorService extends IDocumentVocabularyExtractor {
  private readonly logger = new Logger(DocumentVocabularyExtractorService.name);

  private async applyBertScores(
    payloads: StanzaCandidatePayload[],
  ): Promise<StanzaCandidatePayload[]> {
    try {
      const response = await fetchWithRetry(
        BERT_SERVICE_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidates: payloads.map((p, i) => ({
              id: String(i),
              surface: p.surface,
              contextSentence: p.contextSentence,
            })),
          }),
        },
        { timeoutMs: BERT_TIMEOUT_MS },
      );
      if (!response.ok) {
        throw new Error(`BERT service returned HTTP ${response.status}`);
      }
      const result = (await response.json()) as {
        scores?: { id: string; bertProb: number; selectedByDefault: boolean }[];
      };
      if (!Array.isArray(result.scores)) {
        throw new Error('BERT service returned malformed scores payload');
      }
      const scoreById = new Map(result.scores.map((s) => [s.id, s]));
      return payloads.map((p, i) => {
        const score = scoreById.get(String(i));
        if (!score || p.selectedByDefault === false) {
          return p;
        }
        return { ...p, selectedByDefault: score.selectedByDefault };
      });
    } catch (err) {
      this.logger.warn(
        `BERT scoring unavailable, skipping: ${err instanceof Error ? err.message : String(err)}`,
      );
      return payloads;
    }
  }

  async extract(
    input: ExtractDocumentVocabularyInput,
  ): Promise<DocumentVocabCandidate[]> {
    let payloads: StanzaCandidatePayload[];

    try {
      const response = await fetchWithRetry(
        STANZA_SERVICE_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: input.markdown }),
        },
        { timeoutMs: STANZA_TIMEOUT_MS },
      );
      if (!response.ok) {
        throw new Error(`Stanza service returned HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { candidates?: StanzaCandidatePayload[] };
      if (!Array.isArray(payload.candidates)) {
        throw new Error('Stanza service returned malformed candidates payload');
      }
      payloads = payload.candidates;
    } catch (err) {
      this.logger.warn(
        `Stanza extraction failed, using heuristic fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
      return extractHeuristicDocumentVocabulary(input);
    }

    if (input.targetLang === 'en') {
      payloads = await this.applyBertScores(payloads);
    }

    return payloads.map((candidate) => buildCandidate(input.documentId, candidate));
  }
}
