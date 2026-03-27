from __future__ import annotations

import importlib.util
from pathlib import Path


def resolve_target() -> Path:
    spec = importlib.util.find_spec("vllm_omni")
    if spec is None or spec.origin is None:
        raise RuntimeError("vllm_omni package is not installed")
    package_dir = Path(spec.origin).resolve().parent
    return (
        package_dir
        / "model_executor"
        / "models"
        / "voxtral_tts"
        / "voxtral_tts_audio_tokenizer.py"
    )


def apply_patch() -> None:
    target = resolve_target()
    source = target.read_text()
    patched = source

    flash_before = "        if HAS_FLASH_ATTN:\n"
    flash_after = "        if False and HAS_FLASH_ATTN:\n"
    reshape_before = (
        "        output = output.view(bsz, seqlen, self.n_local_heads * self.args.head_dim)\n"
    )
    reshape_after = (
        "        output = output.reshape(bsz, seqlen, self.n_local_heads * self.args.head_dim)\n"
    )

    if flash_after not in patched:
        if flash_before not in patched:
            raise RuntimeError(f"Unable to locate flash attention block in {target}")
        patched = patched.replace(flash_before, flash_after, 1)

    if reshape_after not in patched:
        if reshape_before not in patched:
            raise RuntimeError(f"Unable to locate reshape block in {target}")
        patched = patched.replace(reshape_before, reshape_after, 1)

    if patched != source:
        target.write_text(patched)
    print(f"Patched Voxtral ROCm runtime: {target}")


if __name__ == "__main__":
    apply_patch()
