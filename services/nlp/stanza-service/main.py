from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

try:
    import stanza  # type: ignore
except Exception:  # pragma: no cover
    stanza = None


APP_TITLE = "stanza-vocabulary-service"
PARTICLES = {
    "up",
    "down",
    "out",
    "off",
    "in",
    "on",
    "over",
    "away",
    "back",
    "after",
    "through",
    "into",
    "around",
}
IDIOMS = [
    "break the ice",
    "hit the books",
    "piece of cake",
    "under the weather",
    "spill the beans",
    "once in a blue moon",
    "cost an arm and a leg",
]
STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "been",
    "being",
    "but",
    "by",
    "for",
    "from",
    "had",
    "has",
    "have",
    "he",
    "her",
    "hers",
    "him",
    "his",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "me",
    "my",
    "of",
    "on",
    "or",
    "our",
    "ours",
    "she",
    "that",
    "the",
    "their",
    "them",
    "they",
    "this",
    "those",
    "to",
    "was",
    "we",
    "were",
    "with",
    "you",
    "your",
}

# NER entity types whose surface forms are poor vocabulary study candidates
# (proper nouns: people, places, organisations, nationalities).
NER_SKIP_TYPES = {"PERSON", "GPE", "LOC", "FAC", "NORP", "ORG"}


class ExtractRequest(BaseModel):
    markdown: str


class ExtractResponse(BaseModel):
    candidates: list[dict[str, Any]]


app = FastAPI(title=APP_TITLE)
_pipeline = None
SERVICE_DIR = Path(__file__).resolve().parent
DEFAULT_MODELS_DIR = SERVICE_DIR / "models"
PIPELINE_PROCESSORS = "tokenize,pos,lemma,depparse,ner"


def strip_markdown(markdown: str) -> str:
    text = re.sub(r"```[\s\S]*?```", " ", markdown)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_~>-]", " ", text)
    text = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", text)
    text = text.replace("|", " ")
    return re.sub(r"\s+", " ", text).strip()


def split_sentences(text: str) -> list[tuple[str, int]]:
    results: list[tuple[str, int]] = []
    for match in re.finditer(r"[^.!?\n]+[.!?\n]?", text):
        sentence = match.group(0).strip()
        if sentence:
            results.append((sentence, match.start()))
    return results


def guess_pos(word: str) -> str | None:
    if word.endswith("ly"):
        return "adverb"
    if word.endswith("ing") or word.endswith("ed"):
        return "verb"
    if re.search(r"(ous|ful|ive|al|able|ible|less|ic)$", word):
        return "adjective"
    return "noun"


def fallback_extract(text: str) -> list[dict[str, Any]]:
    sentences = split_sentences(text)
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_candidate(candidate: dict[str, Any]) -> None:
        key = f"{candidate['normalized']}|{candidate['vocabType']}|{candidate['sentenceIndex']}"
        if key in seen:
            return
        seen.add(key)
        candidates.append(candidate)

    for idiom in IDIOMS:
        start = text.lower().find(idiom)
        if start != -1:
            sentence_index = next(
                (
                    idx
                    for idx, (_, offset) in enumerate(sentences)
                    if offset <= start < offset + len(sentences[idx][0]) + 1
                ),
                0,
            )
            sentence_text = sentences[sentence_index][0] if sentences else text
            add_candidate(
                {
                    "surface": text[start : start + len(idiom)],
                    "normalized": idiom,
                    "lemma": idiom,
                    "vocabType": "idiom",
                    "pos": None,
                    "contextSentence": sentence_text,
                    "sentenceIndex": sentence_index,
                    "startOffset": start,
                    "endOffset": start + len(idiom),
                    "selectedByDefault": True,
                }
            )

    for sentence_index, (sentence_text, sentence_offset) in enumerate(sentences):
        tokens = [
            {
                "surface": match.group(0),
                "normalized": match.group(0).lower(),
                "start": sentence_offset + match.start(),
                "end": sentence_offset + match.end(),
            }
            for match in re.finditer(r"[A-Za-z]+(?:'[A-Za-z]+)?", sentence_text)
        ]

        for idx, token in enumerate(tokens):
            if token["normalized"] in STOP_WORDS or len(token["normalized"]) < 3:
                continue

            pos = guess_pos(token["normalized"])
            if pos is None:
                continue

            lemma = token["normalized"]
            add_candidate(
                {
                    "surface": token["surface"],
                    "normalized": lemma,
                    "lemma": lemma,
                    "vocabType": "word",
                    "pos": pos,
                    "contextSentence": sentence_text,
                    "sentenceIndex": sentence_index,
                    "startOffset": token["start"],
                    "endOffset": token["end"],
                    "selectedByDefault": True,
                }
            )

            if idx + 1 < len(tokens) and pos == "verb" and tokens[idx + 1]["normalized"] in PARTICLES:
                particle = tokens[idx + 1]
                add_candidate(
                    {
                        "surface": f"{token['surface']} {particle['surface']}",
                        "normalized": f"{lemma} {particle['normalized']}",
                        "lemma": f"{lemma} {particle['normalized']}",
                        "vocabType": "phrasal_verb",
                        "pos": "verb",
                        "contextSentence": sentence_text,
                        "sentenceIndex": sentence_index,
                        "startOffset": token["start"],
                        "endOffset": particle["end"],
                        "selectedByDefault": True,
                    }
                )

    return candidates


def get_pipeline():
    global _pipeline
    if stanza is None:
        return None
    if _pipeline is None:
        try:
            models_dir = Path(os.getenv("STANZA_MODEL_DIR", str(DEFAULT_MODELS_DIR)))
            models_dir.mkdir(parents=True, exist_ok=True)
            use_gpu = os.getenv("STANZA_USE_GPU", "false").strip().lower() in {"1", "true", "yes", "on"}
            _pipeline = stanza.Pipeline(
                lang="en",
                processors=PIPELINE_PROCESSORS,
                tokenize_no_ssplit=False,
                model_dir=str(models_dir),
                use_gpu=use_gpu,
            )
        except Exception:
            _pipeline = None
    return _pipeline


# ---------------------------------------------------------------------------
# NER helpers
# ---------------------------------------------------------------------------

def build_ner_skip_spans(doc: Any) -> set[tuple[int, int]]:
    """Return character spans of named entities that are poor vocabulary candidates.

    Proper nouns (people, places, organisations) are excluded from default selection
    because learners study common vocabulary, not proper names.
    """
    return {
        (ent.start_char, ent.end_char)
        for ent in doc.ents
        if ent.type in NER_SKIP_TYPES
    }


def overlaps_ner(start: int, end: int, spans: set[tuple[int, int]]) -> bool:
    return any(s < end and start < e for s, e in spans)


# ---------------------------------------------------------------------------
# Stanza extraction (uses all 5 processors)
# ---------------------------------------------------------------------------

def stanza_extract(text: str) -> list[dict[str, Any]]:
    pipeline = get_pipeline()
    if pipeline is None:
        return fallback_extract(text)

    doc = pipeline(text)
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_candidate(candidate: dict[str, Any]) -> None:
        key = f"{candidate['normalized']}|{candidate['vocabType']}|{candidate['sentenceIndex']}"
        if key in seen:
            return
        seen.add(key)
        candidates.append(candidate)

    # ── NER: build character spans to suppress proper-noun candidates ────────
    ner_skip = build_ner_skip_spans(doc)

    text_lower = text.lower()

    # ── Idiom detection ──────────────────────────────────────────────────────
    for idiom in IDIOMS:
        start = text_lower.find(idiom)
        if start != -1:
            sentence_index = 0
            sentence_text = text
            for idx, sentence in enumerate(doc.sentences):
                sent_start = sentence.tokens[0].start_char
                sent_end = sentence.tokens[-1].end_char
                if sent_start <= start <= sent_end:
                    sentence_index = idx
                    sentence_text = sentence.text
                    break
            add_candidate(
                {
                    "surface": text[start : start + len(idiom)],
                    "normalized": idiom,
                    "lemma": idiom,
                    "vocabType": "idiom",
                    "pos": None,
                    "contextSentence": sentence_text,
                    "sentenceIndex": sentence_index,
                    "startOffset": start,
                    "endOffset": start + len(idiom),
                    "selectedByDefault": True,
                }
            )

    # ── Per-sentence extraction ──────────────────────────────────────────────
    for sentence_index, sentence in enumerate(doc.sentences):
        sentence_text = sentence.text
        words = sentence.words

        # Depparse ① — phrasal verbs: map head word.id → particle word
        # Universal Dependencies uses 'compound:prt' for verb particles.
        prt_by_head: dict[int, Any] = {
            w.head: w for w in words if w.deprel == "compound:prt"
        }

        # Depparse ② — noun compounds: modifier with deprel='compound' + NOUN head
        compound_pairs: list[tuple[Any, Any]] = [
            (w, words[w.head - 1])
            for w in words
            if w.deprel == "compound"
            and 0 < w.head <= len(words)
            and words[w.head - 1].upos in ("NOUN", "PROPN")
        ]

        # ── Word-level candidates ────────────────────────────────────────────
        for idx, word in enumerate(words):
            normalized = word.text.lower()
            if normalized in STOP_WORDS or len(normalized) < 3:
                continue

            # POS tagging (from Stanza UPOS)
            if word.upos == "VERB":
                pos = "verb"
            elif word.upos == "ADV":
                pos = "adverb"
            elif word.upos == "ADJ":
                pos = "adjective"
            elif word.upos == "NOUN":
                pos = "noun"
            else:
                pos = None

            if pos is None:
                continue

            # Lemma (from Stanza lemmatiser)
            lemma = (word.lemma or normalized).lower()

            # NER: named entities are lower-priority study candidates
            is_ne = overlaps_ner(word.start_char, word.end_char, ner_skip)

            add_candidate(
                {
                    "surface": word.text,
                    "normalized": lemma,
                    "lemma": lemma,
                    "vocabType": "word",
                    "pos": pos,
                    "contextSentence": sentence_text,
                    "sentenceIndex": sentence_index,
                    "startOffset": word.start_char,
                    "endOffset": word.end_char,
                    "selectedByDefault": not is_ne,
                }
            )

            # Phrasal verb detection (depparse-preferred, adjacency fallback)
            if pos == "verb":
                prt = prt_by_head.get(word.id)
                if prt:
                    add_candidate(
                        {
                            "surface": f"{word.text} {prt.text}",
                            "normalized": f"{lemma} {prt.text.lower()}",
                            "lemma": f"{lemma} {prt.text.lower()}",
                            "vocabType": "phrasal_verb",
                            "pos": "verb",
                            "contextSentence": sentence_text,
                            "sentenceIndex": sentence_index,
                            "startOffset": min(word.start_char, prt.start_char),
                            "endOffset": max(word.end_char, prt.end_char),
                            "selectedByDefault": True,
                        }
                    )
                elif idx + 1 < len(words) and words[idx + 1].text.lower() in PARTICLES:
                    nxt = words[idx + 1]
                    add_candidate(
                        {
                            "surface": f"{word.text} {nxt.text}",
                            "normalized": f"{lemma} {nxt.text.lower()}",
                            "lemma": f"{lemma} {nxt.text.lower()}",
                            "vocabType": "phrasal_verb",
                            "pos": "verb",
                            "contextSentence": sentence_text,
                            "sentenceIndex": sentence_index,
                            "startOffset": word.start_char,
                            "endOffset": nxt.end_char,
                            "selectedByDefault": True,
                        }
                    )

        # ── Noun compound collocations (depparse) ────────────────────────────
        for mod_word, head_word in compound_pairs:
            cstart = min(mod_word.start_char, head_word.start_char)
            cend = max(mod_word.end_char, head_word.end_char)

            # Skip named-entity compounds ("New York", "United States", etc.)
            if overlaps_ner(cstart, cend, ner_skip):
                continue

            surface = text[cstart:cend]
            mod_lemma = (mod_word.lemma or mod_word.text).lower()
            head_lemma = (head_word.lemma or head_word.text).lower()
            compound_norm = f"{mod_lemma} {head_lemma}"

            if compound_norm in STOP_WORDS or len(compound_norm) < 4:
                continue

            add_candidate(
                {
                    "surface": surface,
                    "normalized": compound_norm,
                    "lemma": compound_norm,
                    "vocabType": "collocation",
                    "pos": "noun",
                    "contextSentence": sentence_text,
                    "sentenceIndex": sentence_index,
                    "startOffset": cstart,
                    "endOffset": cend,
                    "selectedByDefault": True,
                }
            )

    return candidates


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "stanzaAvailable": stanza is not None,
        "pipelineReady": get_pipeline() is not None,
        "stanzaProcessors": PIPELINE_PROCESSORS,
        "activeFeatures": ["tokenize", "pos", "lemma", "ner", "depparse"],
        "stanzaUseGpu": os.getenv("STANZA_USE_GPU", "false").strip().lower() in {"1", "true", "yes", "on"},
        "stanzaModelDir": os.getenv("STANZA_MODEL_DIR", str(DEFAULT_MODELS_DIR)),
    }


@app.post("/extract", response_model=ExtractResponse)
def extract(request: ExtractRequest) -> ExtractResponse:
    plain_text = strip_markdown(request.markdown)
    if not plain_text:
        return ExtractResponse(candidates=[])
    candidates = stanza_extract(plain_text)
    return ExtractResponse(candidates=candidates)
