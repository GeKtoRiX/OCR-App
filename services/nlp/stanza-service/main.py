from __future__ import annotations

import re
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


class ExtractRequest(BaseModel):
    markdown: str


class ExtractResponse(BaseModel):
    candidates: list[dict[str, Any]]


app = FastAPI(title=APP_TITLE)
_pipeline = None


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
            _pipeline = stanza.Pipeline(
                lang="en",
                processors="tokenize,pos,lemma,depparse",
                tokenize_no_ssplit=False,
                use_gpu=False,
                download_method=None,
            )
        except Exception:
            _pipeline = None
    return _pipeline


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

    text_lower = text.lower()
    for idiom in IDIOMS:
        start = text_lower.find(idiom)
        if start != -1:
            sentence_index = 0
            sentence_text = text
            for idx, sentence in enumerate(doc.sentences):
                sent_text = " ".join(token.text for token in sentence.tokens)
                sent_start = text_lower.find(sent_text.lower())
                if sent_start != -1 and sent_start <= start < sent_start + len(sent_text):
                    sentence_index = idx
                    sentence_text = sent_text
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

    for sentence_index, sentence in enumerate(doc.sentences):
        sentence_text = " ".join(token.text for token in sentence.tokens)
        cursor = text_lower.find(sentence_text.lower())
        words = sentence.words
        for idx, word in enumerate(words):
            normalized = word.text.lower()
            if normalized in STOP_WORDS or len(normalized) < 3:
                continue

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

            word_start = cursor if cursor != -1 else text_lower.find(normalized)
            word_end = word_start + len(word.text) if word_start != -1 else len(word.text)
            cursor = word_end

            lemma = (word.lemma or normalized).lower()
            add_candidate(
                {
                    "surface": word.text,
                    "normalized": lemma,
                    "lemma": lemma,
                    "vocabType": "word",
                    "pos": pos,
                    "contextSentence": sentence_text,
                    "sentenceIndex": sentence_index,
                    "startOffset": max(word_start, 0),
                    "endOffset": max(word_end, 0),
                    "selectedByDefault": True,
                }
            )

            if idx + 1 < len(words):
                next_word = words[idx + 1]
                if pos == "verb" and next_word.text.lower() in PARTICLES:
                    add_candidate(
                        {
                            "surface": f"{word.text} {next_word.text}",
                            "normalized": f"{lemma} {next_word.text.lower()}",
                            "lemma": f"{lemma} {next_word.text.lower()}",
                            "vocabType": "phrasal_verb",
                            "pos": "verb",
                            "contextSentence": sentence_text,
                            "sentenceIndex": sentence_index,
                            "startOffset": max(word_start, 0),
                            "endOffset": max(word_end + 1 + len(next_word.text), 0),
                            "selectedByDefault": True,
                        }
                    )

    return candidates


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "stanzaAvailable": stanza is not None}


@app.post("/extract", response_model=ExtractResponse)
def extract(request: ExtractRequest) -> ExtractResponse:
    plain_text = strip_markdown(request.markdown)
    if not plain_text:
        return ExtractResponse(candidates=[])
    candidates = stanza_extract(plain_text)
    return ExtractResponse(candidates=candidates)
