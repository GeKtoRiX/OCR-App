FROM vllm/vllm-omni-rocm:v0.16.0

ENV HSA_OVERRIDE_GFX_VERSION=11.0.0 \
    HSA_NO_SCRATCH_RECLAIM=1 \
    HIP_FORCE_DEV_KERNARG=1 \
    HF_HOME=/root/.cache/huggingface \
    VLLM_CACHE_ROOT=/root/.cache/vllm \
    TOKENIZERS_PARALLELISM=false \
    UV_HTTP_TIMEOUT=500 \
    UV_INDEX_STRATEGY=unsafe-best-match \
    UV_LINK_MODE=copy

COPY patch_voxtral_runtime.py /tmp/patch_voxtral_runtime.py

RUN python -m pip install --no-cache-dir --upgrade pip && \
    python -m pip install --no-cache-dir -U --extra-index-url https://wheels.vllm.ai/rocm/0.18.0/rocm700 "vllm==0.18.0+rocm700" && \
    python -m pip install --no-cache-dir --no-build-isolation -U "git+https://github.com/vllm-project/vllm-omni.git@bd8b9b61420f4e7844e7eec6e8876e8b87d7516e" && \
    python /tmp/patch_voxtral_runtime.py && \
    rm -f /tmp/patch_voxtral_runtime.py

EXPOSE 8401

CMD ["mistralai/Voxtral-4B-TTS-2603", "--host", "0.0.0.0", "--port", "8401"]
