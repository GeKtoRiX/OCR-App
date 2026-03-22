# OCR-App

Alpha release baseline: `v0.1.0-alpha.1`

Web application for extracting text from images. Upload a screenshot, photo of a document, or any image containing text — the app will extract the text, format it as Markdown, and optionally synthesize it as speech.

**Core OCR, TTS, vocabulary, and practice flows run locally.** The only cloud-dependent feature is the optional `agentic` API (`/api/agents/*`), which requires `OPENAI_API_KEY`.

---

## How it works

```
Image → PaddleOCR (recognition) → LM Studio (Markdown formatting) → Result
                                                                         ↓
                              Supertone / Piper / Kokoro / F5 TTS (optional WAV)
```

1. **PaddleOCR** — fast OCR engine running as a separate local sidecar (Python FastAPI, port 8000). Supports GPU (AMD ROCm) and CPU.
2. **LM Studio** — local LLM server. Used to structure raw OCR text into Markdown and to generate vocabulary exercises.
3. **Supertone + Piper TTS** — shared local TTS sidecar (Python FastAPI, port 8100). Supertone supports AMD ROCm GPU and automatically falls back to CPU if the GPU runtime is present but inference fails. Piper voices are downloaded on demand and run through the same sidecar.
4. **Kokoro TTS** — local TTS sidecar (Python FastAPI, port 8200). Uses `kokoro-onnx` with ONNX Runtime; tries ROCm GPU first and falls back to CPU if the provider cannot initialize or run inference.
5. **F5 TTS** — local TTS sidecar (Python FastAPI, port 8300). Uses uploaded reference audio + reference text for voice cloning and requires a working GPU.

---

## Requirements

| Component | Version |
|-----------|---------|
| [Node.js](https://nodejs.org/) | 20+ |
| [LM Studio](https://lmstudio.ai/) | Latest |
| Python | 3.10+ |
| GPU (optional) | AMD with ROCm support |

> Without a GPU the app runs on CPU — slower, but fully functional.

---

## Quick start

### 1. Set up LM Studio

1. Install and open [LM Studio](https://lmstudio.ai/).
2. Download a text formatting model:
   - **Discover** tab → search for `qwen/qwen3.5-9b` → **Download**.
3. Start the local server:
   - **Developer** tab (`</>` icon) → **Start Server**.
   - Server should be available at `http://localhost:1234`.

> LM Studio must be running **before and during** app usage.

### 2. Clone the repository

```bash
git clone https://github.com/GeKtoRiX/OCR-App.git
cd OCR-App
```

### 3. Install Node.js dependencies

```bash
npm install
```

### 4. Set up the PaddleOCR sidecar

```bash
cd services/ocr/paddleocr-service
python3.10 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install paddlepaddle-gpu==2.6.2 -f https://www.paddlepaddle.org.cn/whl/linux/rocm/stable.html
pip install -r requirements.txt
```

### 5. Set up the Supertone TTS sidecar

```bash
cd services/tts/supertone-service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
# GPU (AMD ROCm): uninstall onnxruntime first, then install rocm version
pip uninstall -y onnxruntime
pip install onnxruntime-rocm==1.22.2
pip install -r requirements.txt
```

> On first run the `supertonic-2` model (~300 MB) downloads automatically.

### 6. Set up the Kokoro TTS sidecar

```bash
cd services/tts/kokoro-service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
# Optional ROCm path for ONNX Runtime:
pip uninstall -y onnxruntime
pip install onnxruntime-rocm==1.22.2.post1
```

> The Kokoro sidecar uses `kokoro-onnx` and downloads `kokoro-v1.0.onnx` plus `voices-v1.0.bin` into `services/tts/kokoro-service/models/` on first run if they are missing.
> On this project stack the service prefers `ROCMExecutionProvider`, but falls back to `CPUExecutionProvider` automatically if ROCm cannot execute the model on the current GPU.

### 7. Set up the F5 TTS sidecar

```bash
cd services/tts/f5-service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

> `F5-TTS` is GPU-only in this project. If the sidecar cannot report `ready: true` and `device: gpu`, it stays unavailable by design.
> On AMD ROCm systems, keep `LD_LIBRARY_PATH` pointed at the PyTorch ROCm libs when launching the sidecar.

### 8. Start a launcher

```bash
chmod +x scripts/linux/ocr.sh scripts/linux/tts.sh scripts/linux/ocr-tts.sh
./scripts/linux/ocr-tts.sh
```

Use the dedicated entry that matches your mode:

- `./scripts/linux/ocr.sh` starts PaddleOCR + Kokoro + LM Studio + backend
- `./scripts/linux/tts.sh` starts PaddleOCR + Supertone/Piper + Kokoro + F5 + backend
- `./scripts/linux/ocr-tts.sh` starts OCR + TTS + LM Studio + backend
- `./scripts/linux/stack.sh` opens an interactive English menu to start, stop, inspect, and switch stacks without closing the script

`ocr-tts.sh` is the full-stack entry. Press **Ctrl+C** to stop all project services gracefully.

**Done!** The app will be available at [http://localhost:3000](http://localhost:3000) when any backend-enabled launcher is running (`ocr.sh`, `tts.sh`, or `ocr-tts.sh`).

### Manual lifecycle

```bash
./scripts/linux/ocr.sh         # start OCR mode (foreground, Ctrl+C to stop)
./scripts/linux/ocr.sh stop    # stop all project services
./scripts/linux/ocr.sh wipe    # stop + remove all build artifacts
./scripts/linux/ocr.sh status  # OCR-oriented health and process state

./scripts/linux/tts.sh         # start TTS mode
./scripts/linux/tts.sh stop    # stop all project services
./scripts/linux/tts.sh status  # TTS-oriented health and process state

./scripts/linux/ocr-tts.sh         # start full stack
./scripts/linux/ocr-tts.sh stop    # stop all project services
./scripts/linux/ocr-tts.sh status  # full-stack health and process state

./scripts/linux/stack.sh       # interactive stack menu (start/stop/switch/status)
```

---

## Usage

### Upload an image

- **Drag and drop** a file into the upload area
- **Click** the area and select a file
- **Paste** an image from clipboard (`Ctrl+V`)

Supported formats: PNG, JPEG, WebP, BMP, TIFF — up to **10 MB**.

### Results

After processing (5–30 seconds) two tabs appear:

- **Markdown** — structured text with headings and lists
- **Raw Text** — plain extracted text without formatting

The **Copy** button copies the active tab content to clipboard.

### Edit extracted text

Click **Edit** in the result panel to switch the text into an editable `<textarea>`. Click **Done** to confirm. Edits affect only what is sent to TTS — the original OCR result is preserved in session history.

### Vocabulary capture and session cleanup

- **Session** history entries can be deleted via the small trash icon that appears on hover.
- **Saved** documents can also be deleted via the hover trash icon.
- **Add to Vocabulary** is available only in the normal rendered **Markdown** view: select text and right-click.
- In **Edit** mode, vocabulary capture is intentionally disabled.

### Text-to-Speech (TTS)

Click the **TTS** toggle in the result panel to open the settings panel:

- **Supertone** — preset voices M1–M5 / F1–F5
- **Kokoro** — local Kokoro voices
- **Piper** — downloadable Piper voices
- **F5** — upload a short reference audio clip and enter its transcript

Click **Generate** to synthesize speech. The WAV file downloads automatically.

### Status indicator

A color-coded indicator shows service health at all times:

| Color | Status |
|-------|--------|
| 🔵 Blue | All systems fully operational (GPU + LM Studio + F5 TTS + Supertone) |
| 🟢 Green | PaddleOCR GPU OK, but LM Studio / F5 TTS / Supertone missing |
| 🟡 Yellow | PaddleOCR running on CPU |
| 🔴 Red | PaddleOCR unreachable |

---

## Configuration

Create a `.env` file in the project root (already present by default):

```env
# LM Studio
LM_STUDIO_BASE_URL=http://localhost:1234/v1
STRUCTURING_MODEL=qwen/qwen3.5-9b
LM_STUDIO_TIMEOUT=120000

# PaddleOCR
PADDLEOCR_HOST=localhost
PADDLEOCR_PORT=8000
PADDLEOCR_TIMEOUT=30000

# Supertone TTS
SUPERTONE_HOST=localhost
SUPERTONE_PORT=8100
SUPERTONE_TIMEOUT=120000

# F5 TTS
F5_TTS_HOST=localhost
F5_TTS_PORT=8300
F5_TTS_TIMEOUT=180000

# Server
PORT=3000
```

### AMD GPU (ROCm)

Both sidecars use the ROCm stack already installed in your Linux environment.

If your ROCm setup needs it, export the override before starting the sidecars:

```bash
export HSA_OVERRIDE_GFX_VERSION=11.0.0
```

The launcher scripts set the required `LD_LIBRARY_PATH` automatically for F5 and the other ROCm-enabled sidecars.

---

## Development mode

```bash
# Install dependencies
npm install

# Start each service individually
npm run dev:paddleocr    # PaddleOCR sidecar (port 8000)
npm run smoke:paddleocr  # Smoke-test PaddleOCR startup

npm run dev:supertone    # Supertone + Piper TTS sidecar (port 8100)
npm run smoke:supertone  # Smoke-test Supertone + Piper startup

npm run dev:kokoro       # Kokoro TTS sidecar (port 8200, ONNX Runtime with ROCm->CPU fallback)
npm run smoke:kokoro     # Smoke-test Kokoro startup

npm run dev:f5           # F5 TTS sidecar (port 8300, GPU required)
npm run smoke:f5         # Smoke-test F5 TTS startup

npm run smoke:lmstudio   # Smoke-test LM Studio structuring from backend
npm run smoke:all        # PaddleOCR + Supertone/Piper + Kokoro + F5 smoke suite

npm run dev:backend      # NestJS backend (port 3000)
npm run dev:frontend     # Vite dev server (port 5173, proxies /api → :3000)
```

App is available at [http://localhost:5173](http://localhost:5173) in dev mode.

### Tests and perf

```bash
npm run test:cov              # frontend + backend coverage
npm run test:e2e:api          # backend API e2e
npm run test:e2e:integration  # backend integration tests against live deps
npm run test:e2e:browser      # Playwright browser e2e on production-like stack

npm run perf:api              # API latency benchmark
npm run perf:browser          # browser workflow benchmark
npm run perf:phase4           # full Phase 4 benchmark harness
```

`test:e2e:browser` and `perf:phase4` use a temporary SQLite database under `tmp/test-db/` and set `LM_STUDIO_SMOKE_ONLY=true`, so browser/perf runs do not send real structuring or vocabulary LLM requests to LM Studio.

---

## Troubleshooting

### App does not open / connection error

1. Check that the backend started: `curl http://localhost:3000/api/health`
2. Check the terminal where you ran the launcher script for errors.

### Red indicator / OCR not working

1. Check that the PaddleOCR sidecar responds: `curl http://localhost:8000/health`
2. On first run the model downloads in ~1–2 minutes — wait for it.
3. Check `.logs/paddleocr.log` for errors.

### TTS not working / Supertone unavailable

1. Check that the Supertone sidecar responds: `curl http://localhost:8100/health`
2. On first run the `supertonic-2` model downloads (~300 MB) — wait for it.
3. Check `.logs/supertone.log` for errors.
4. GPU (ROCm) not required — the sidecar falls back to CPU automatically.

### F5 TTS not working

1. Check that the F5 sidecar responds: `curl http://localhost:8300/health`
2. F5 TTS is GPU-only in this project. If `/health` shows `ready: false` or `device` is not `gpu`, synthesis is intentionally disabled.
3. On first run the model downloads from Hugging Face.
4. F5 requires both a reference audio file and matching reference text.
5. Check `logs/f5.log` for model load or ROCm/CUDA errors.

### Kokoro TTS not working

1. Check that the Kokoro sidecar responds: `curl http://localhost:8200/health`
2. Check the `provider` field in `/health`. `ROCMExecutionProvider` means GPU ONNX is active; `CPUExecutionProvider` means the service fell back to CPU.
3. On first run the sidecar downloads `kokoro-v1.0.onnx` and `voices-v1.0.bin` into `services/tts/kokoro-service/models/`.
4. Check `logs/kokoro.log` for ONNX Runtime provider initialization errors.

### LM Studio unavailable

1. Make sure LM Studio is running and the server is active (**Developer** tab).
2. Open [http://localhost:1234/v1/models](http://localhost:1234/v1/models) — it should return JSON.

### 502 error when processing an image

1. Check that a model is loaded in LM Studio (visible in the model list).
2. Increase the timeout in `.env`: `LM_STUDIO_TIMEOUT=300000`
3. Make sure there is enough RAM for the model to run.

### Port 3000 already in use

Change the port in `.env`:
```env
PORT=8080
```

---

## API

### `POST /api/ocr`

```bash
curl -X POST http://localhost:3000/api/ocr \
  -F "image=@document.png"
```

```json
{
  "rawText": "Extracted text...",
  "markdown": "# Heading\n\nStructured text...",
  "filename": "document.png"
}
```

### `GET /api/health`

```bash
curl http://localhost:3000/api/health
```

```json
{
  "paddleOcrReachable": true,
  "paddleOcrDevice": "gpu",
  "paddleOcrModels": ["PP-OCRv4"],
  "lmStudioReachable": true,
  "lmStudioModels": ["qwen/qwen3.5-9b"],
  "superToneReachable": true,
  "kokoroReachable": true,
  "f5TtsReachable": true,
  "f5TtsDevice": "gpu"
}
```

### `POST /api/tts`

```bash
curl -X POST http://localhost:3000/api/tts \
  -F "engine=f5" \
  -F "text=Hello world" \
  -F "refText=This is a short reference clip." \
  -F "refAudio=@reference.wav" \
  --output speech.wav
```

Returns `audio/wav` binary.

Supported engines:

- `supertone` — voices `M1`-`M5`, `F1`-`F5`; langs `en`, `ko`, `es`, `pt`, `fr`
- `piper` — curated downloadable voices such as `en_US-hfc_female-medium`
- `kokoro` — local voices such as `af_heart`, `af_bella`, `am_fenrir`, `bm_fable`
- `f5` — reference-audio voice cloning

### `POST /api/documents`

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Hello\nWorld","filename":"scan.png"}'

# List: GET /api/documents
# Update: PUT /api/documents/<id>  -d '{"markdown":"# Updated"}'
# Delete: DELETE /api/documents/<id>
```

### `POST /api/vocabulary`

```bash
curl -X POST http://localhost:3000/api/vocabulary \
  -H "Content-Type: application/json" \
  -d '{"word":"beautiful","vocabType":"word","translation":"красивый","targetLang":"en","nativeLang":"ru"}'

# List: GET /api/vocabulary?targetLang=en&nativeLang=ru
# Due:  GET /api/vocabulary/review/due?limit=20
```

### Practice

```bash
# Start session
curl -X POST http://localhost:3000/api/practice/start \
  -H "Content-Type: application/json" \
  -d '{"targetLang":"en","nativeLang":"ru","wordLimit":10}'

# Submit answer
curl -X POST http://localhost:3000/api/practice/answer \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>","vocabularyId":"<id>","exerciseType":"spelling","prompt":"Spell: красивый","correctAnswer":"beautiful","userAnswer":"beatiful"}'

# Complete + get analysis
curl -X POST http://localhost:3000/api/practice/complete \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>"}'
```

---

## Tech stack

- **Backend:** NestJS 10 (TypeScript)
- **Frontend:** React 18 + Vite 6 (TypeScript)
- **OCR:** PaddleOCR (Python FastAPI, AMD ROCm, port 8000)
- **TTS:** Supertone + Piper sidecar (Python FastAPI, port 8100), Kokoro ONNX sidecar (Python FastAPI, ONNX Runtime, port 8200), F5 TTS (port 8300)
- **LLM:** LM Studio (local OpenAI-compatible API, port 1234)
- **Persistence:** SQLite via better-sqlite3 (saved documents, vocabulary SRS, practice sessions)
- **Optional agentic runtime:** OpenAI Agents SDK for `/api/agents/*`
