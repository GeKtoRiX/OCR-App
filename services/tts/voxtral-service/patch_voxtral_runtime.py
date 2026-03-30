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

    patch_entrypoint_utils()


def patch_entrypoint_utils() -> None:
    spec = importlib.util.find_spec("vllm_omni.entrypoints.utils")
    if spec is None or spec.origin is None:
        raise RuntimeError("vllm_omni.entrypoints.utils is not installed")

    target = Path(spec.origin).resolve()
    source = target.read_text()
    patched = source

    before = """        elif file_or_path_exists(model, "config.json", revision=None):\n            # Try to read config.json manually for custom models like Bagel that fail get_config\n            # but have a valid config.json with model_type\n            try:\n                config_dict = get_hf_file_to_dict("config.json", model, revision=None)\n                if config_dict and "model_type" in config_dict:\n                    model_type = config_dict["model_type"]\n                else:\n                    raise ValueError(f"config.json found but missing 'model_type' for model: {model}")\n            except Exception as e:\n                raise ValueError(f"Failed to read config.json for model: {model}. Error: {e}") from e\n        else:\n"""
    after = """        elif file_or_path_exists(model, "config.json", revision=None):\n            # Try to read config.json manually for custom models like Bagel that fail get_config\n            # but have a valid config.json with model_type\n            try:\n                config_dict = get_hf_file_to_dict("config.json", model, revision=None)\n                if config_dict and "model_type" in config_dict:\n                    model_type = config_dict["model_type"]\n                else:\n                    raise ValueError(f"config.json found but missing 'model_type' for model: {model}")\n            except Exception as e:\n                raise ValueError(f"Failed to read config.json for model: {model}. Error: {e}") from e\n        elif file_or_path_exists(model, "params.json", revision=None):\n            # Mistral TTS repositories such as Voxtral ship params.json instead of config.json.\n            model_type = "voxtral_tts"\n        else:\n"""

    if after not in patched:
        if before not in patched:
            raise RuntimeError(f"Unable to locate config fallback block in {target}")
        patched = patched.replace(before, after, 1)

    if patched != source:
        target.write_text(patched)
    print(f"Patched Voxtral config resolution: {target}")


if __name__ == "__main__":
    apply_patch()
