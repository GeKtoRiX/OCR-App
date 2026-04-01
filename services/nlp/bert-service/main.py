from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

try:
    import torch  # type: ignore
    from transformers import BertForMaskedLM, BertTokenizerFast  # type: ignore
    _TRANSFORMERS_AVAILABLE = True
except Exception:  # pragma: no cover
    _TRANSFORMERS_AVAILABLE = False

MODEL_NAME = os.getenv("BERT_MODEL_NAME", "prajjwal1/bert-tiny")
USE_GPU = os.getenv("BERT_USE_GPU", "false").strip().lower() in {"1", "true", "yes", "on"}
SERVICE_DIR = Path(__file__).resolve().parent
MODEL_CACHE_DIR = Path(os.getenv("BERT_MODEL_DIR", str(SERVICE_DIR / "models")))

# Words whose BERT MLM probability exceeds this threshold are
# contextually predictable (easy) and should be deselected by default.
DESELECT_THRESHOLD = 0.15

app = FastAPI(title="bert-vocabulary-scorer")

_tokenizer: Any = None
_model: Any = None
_device: Any = None


def _load_model() -> bool:
    global _tokenizer, _model, _device
    if not _TRANSFORMERS_AVAILABLE:
        return False
    if _model is not None:
        return True
    try:
        MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _tokenizer = BertTokenizerFast.from_pretrained(
            MODEL_NAME, cache_dir=str(MODEL_CACHE_DIR)
        )
        _model = BertForMaskedLM.from_pretrained(
            MODEL_NAME, cache_dir=str(MODEL_CACHE_DIR)
        )
        _model.eval()
        if USE_GPU and torch.cuda.is_available():
            _device = torch.device("cuda")
        else:
            _device = torch.device("cpu")
        _model.to(_device)
        return True
    except Exception:
        _tokenizer = None
        _model = None
        return False


def _score_candidate(surface: str, context: str) -> float:
    """Return the MLM probability of *surface* in *context* under the configured local BERT MLM.

    The sentence is tokenised, the subword tokens that correspond to *surface*
    are all replaced with [MASK], and a single forward pass recovers the joint
    probability as the geometric mean of per-subword marginal probabilities.

    Returns 0.5 on any failure so the caller can treat the result as neutral.
    """
    if _model is None or _tokenizer is None:
        return 0.5

    # Locate the surface form inside the context (case-sensitive, first match).
    idx = context.find(surface)
    if idx == -1:
        # Fallback: case-insensitive search
        idx = context.lower().find(surface.lower())
    if idx == -1:
        return 0.5

    prefix = context[:idx]
    suffix = context[idx + len(surface):]

    # Tokenise prefix, surface, and suffix separately to find subword positions.
    prefix_ids = _tokenizer(prefix, add_special_tokens=False)["input_ids"]
    surface_ids = _tokenizer(surface, add_special_tokens=False)["input_ids"]
    suffix_ids = _tokenizer(suffix, add_special_tokens=False)["input_ids"]

    if not surface_ids:
        return 0.5

    # Build the full sequence: [CLS] prefix... [MASK]... suffix... [SEP]
    # We replace all surface subword positions with [MASK].
    mask_id = _tokenizer.mask_token_id
    cls_id = _tokenizer.cls_token_id
    sep_id = _tokenizer.sep_token_id

    input_ids = (
        [cls_id]
        + prefix_ids
        + [mask_id] * len(surface_ids)
        + suffix_ids
        + [sep_id]
    )

    # Clamp to model max length (512).
    if len(input_ids) > 512:
        return 0.5

    mask_start = 1 + len(prefix_ids)
    mask_end = mask_start + len(surface_ids)

    input_tensor = torch.tensor([input_ids], device=_device)

    with torch.no_grad():
        logits = _model(input_tensor).logits  # (1, seq_len, vocab_size)

    log_probs = torch.log_softmax(logits[0], dim=-1)  # (seq_len, vocab_size)

    # Sum log-probs over all masked positions for the corresponding surface token.
    total_log_prob = 0.0
    for i, token_id in enumerate(surface_ids):
        total_log_prob += log_probs[mask_start + i, token_id].item()

    # Geometric mean probability across subwords.
    mean_log_prob = total_log_prob / len(surface_ids)
    return math.exp(mean_log_prob)


class CandidateInput(BaseModel):
    id: str
    surface: str
    contextSentence: str


class ScoreRequest(BaseModel):
    candidates: list[CandidateInput]


class ScoreResult(BaseModel):
    id: str
    bertProb: float
    selectedByDefault: bool


class ScoreResponse(BaseModel):
    scores: list[ScoreResult]


@app.on_event("startup")
def on_startup() -> None:
    _load_model()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "modelReady": _model is not None,
        "modelName": MODEL_NAME,
        "useGpu": USE_GPU and _device is not None and str(_device) != "cpu",
        "device": str(_device) if _device is not None else None,
        "transformersAvailable": _TRANSFORMERS_AVAILABLE,
        "supportedLanguage": "en",
    }


@app.post("/score", response_model=ScoreResponse)
def score(request: ScoreRequest) -> ScoreResponse:
    if _model is None:
        # Model not loaded — return neutral scores (selectedByDefault unchanged)
        return ScoreResponse(
            scores=[
                ScoreResult(id=c.id, bertProb=0.5, selectedByDefault=True)
                for c in request.candidates
            ]
        )

    results: list[ScoreResult] = []
    for candidate in request.candidates:
        try:
            prob = _score_candidate(candidate.surface, candidate.contextSentence)
        except Exception:
            prob = 0.5
        results.append(
            ScoreResult(
                id=candidate.id,
                bertProb=round(prob, 6),
                selectedByDefault=prob < DESELECT_THRESHOLD,
            )
        )

    return ScoreResponse(scores=results)
