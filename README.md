# OCR-App

Web application for extracting text from images. Upload a screenshot, photo of a document, or any image containing text — the app will extract the text, format it as Markdown, and optionally synthesize it as speech.

**Everything runs locally.** No data is sent to the cloud.

---

## How it works

```
Image → PaddleOCR (recognition) → LM Studio (Markdown formatting) → Result
                                                                         ↓
                                          Supertone / Kokoro / Qwen TTS (optional WAV)
```

1. **PaddleOCR** — fast OCR engine running as a separate local sidecar (Python FastAPI, port 8000). Supports GPU (AMD ROCm) and CPU.
2. **LM Studio** — local LLM server. Used to structure raw OCR text into Markdown and to generate vocabulary exercises.
3. **Supertone TTS** — local TTS sidecar (Python FastAPI, port 8100). ONNX Runtime-based, supports AMD ROCm GPU. Voices: M1–M5, F1–F5. Languages: en, ko, es, pt, fr.
4. **Kokoro TTS** — local TTS sidecar (Python FastAPI, port 8200). GPU support.
5. **Qwen TTS CustomVoice** — local TTS sidecar (Python FastAPI, port 8300). Runs `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` and requires a working GPU.

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
```

### 7. Set up the Qwen TTS sidecar

```bash
cd services/tts/qwen-service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

> `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` is GPU-only in this project. If the sidecar cannot report `ready: true` and `device: gpu`, it stays unavailable by design.
> On `RX 7600 XT / gfx1102`, this project runs Qwen with `HSA_OVERRIDE_GFX_VERSION=11.0.0` and `QWEN_TTS_ATTN_IMPLEMENTATION=eager`.

### 8. Start everything

```bash
chmod +x scripts/linux/ocr.sh
./scripts/linux/ocr.sh
```

The script auto-starts PaddleOCR, Supertone TTS, Kokoro TTS, Qwen TTS, and the NestJS backend. Press **Ctrl+C** to stop all services gracefully.

**Done!** The app will be available at [http://localhost:3000](http://localhost:3000).

### Alternative mode-based launcher

```bash
chmod +x scripts/linux/ocr-menu.sh
./scripts/linux/ocr-menu.sh
```

`ocr-menu.sh` keeps the same general launcher style, but shows a startup menu:

- `1` — `OCR`: PaddleOCR + LM Studio + `qwen/qwen3.5-9b` + backend
- `2` — `TTS`: PaddleOCR + Supertone + Kokoro + Qwen TTS + backend
- `3` — `All`: OCR + TTS + LM Studio model

Mode `3` checks current free VRAM before startup and refuses to run unless at least `4 GiB` is free. If the VRAM counters are unavailable or the free VRAM is below that threshold, the launcher tells you to use mode `1` or `2` instead.

`Ctrl+C`, `stop`, failed startup, and `wipe` use aggressive cleanup in `ocr-menu.sh`: the launcher stops tracked sidecars, terminates known project processes, unloads/stops LM Studio when possible, and force-clears project ports `1234`, `3000`, `5173`, `8000`, `8100`, `8200`, and `8300`. This includes externally started `kokoro` and `vite` listeners.

### Manual lifecycle

```bash
./scripts/linux/ocr.sh          # start all services (foreground, Ctrl+C to stop)
./scripts/linux/ocr.sh stop     # stop all services
./scripts/linux/ocr.sh wipe     # stop + remove all build artifacts
./scripts/linux/ocr.sh status   # show env config, health and process state

./scripts/linux/ocr-menu.sh         # interactive OCR / TTS / All launcher
./scripts/linux/ocr-menu.sh start   # same as above
./scripts/linux/ocr-menu.sh stop    # aggressive stop + clear all project ports
./scripts/linux/ocr-menu.sh wipe    # stop + clear ports + remove build artifacts
./scripts/linux/ocr-menu.sh status  # mode-aware status, plus Vite visibility
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

### Text-to-Speech (TTS)

Click the **TTS** toggle in the result panel to open the settings panel:

- **Voice** — select M1–M5 (male) or F1–F5 (female)
- **Language** — en / ko / es / pt / fr
- **Speed** — 0.5× to 2.0×
- **Quality** — total denoising steps (1–20)

Click **Generate** to synthesize speech. The WAV file downloads automatically.

### Status indicator

A color-coded indicator shows service health at all times:

| Color | Status |
|-------|--------|
| 🔵 Blue | All systems fully operational (GPU + LM Studio + Qwen TTS + Supertone) |
| 🟢 Green | PaddleOCR GPU OK, but LM Studio / Qwen TTS / Supertone missing |
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

# Qwen TTS
QWEN_TTS_HOST=localhost
QWEN_TTS_PORT=8300
QWEN_TTS_TIMEOUT=180000
QWEN_TTS_HSA_OVERRIDE_GFX_VERSION=11.0.0
QWEN_TTS_ATTN_IMPLEMENTATION=eager

# Server
PORT=3000
```

### AMD GPU (ROCm)

Both sidecars use the ROCm stack already installed in your Linux environment.

If your ROCm setup needs it, export the override before starting the sidecars:

```bash
export HSA_OVERRIDE_GFX_VERSION=11.0.0
```

For Qwen on `RX 7600 XT / gfx1102`, also keep the attention backend on `eager`:

```bash
export QWEN_TTS_ATTN_IMPLEMENTATION=eager
```

The `ocr.sh` script sets the required `LD_LIBRARY_PATH` automatically and defaults Qwen to these ROCm-safe values.

---

## Development mode

```bash
# Install dependencies
npm install

# Start each service individually
npm run dev:paddleocr    # PaddleOCR sidecar (port 8000)
npm run smoke:paddleocr  # Smoke-test PaddleOCR startup

npm run dev:supertone    # Supertone TTS sidecar (port 8100, GPU enabled)
npm run smoke:supertone  # Smoke-test Supertone startup

npm run dev:kokoro       # Kokoro TTS sidecar (port 8200, GPU enabled)

npm run dev:qwen         # Qwen TTS CustomVoice sidecar (port 8300, GPU required)
npm run smoke:qwen       # Smoke-test Qwen TTS startup

npm run dev:backend      # NestJS backend (port 3000)
npm run dev:frontend     # Vite dev server (port 5173, proxies /api → :3000)
```

App is available at [http://localhost:5173](http://localhost:5173) in dev mode.

---

## Troubleshooting

### App does not open / connection error

1. Check that the backend started: `curl http://localhost:3000/api/health`
2. Check the terminal where you ran `ocr.sh` for errors.

### Red indicator / OCR not working

1. Check that the PaddleOCR sidecar responds: `curl http://localhost:8000/health`
2. On first run the model downloads in ~1–2 minutes — wait for it.
3. Check `.logs/paddleocr.log` for errors.

### TTS not working / Supertone unavailable

1. Check that the Supertone sidecar responds: `curl http://localhost:8100/health`
2. On first run the `supertonic-2` model downloads (~300 MB) — wait for it.
3. Check `.logs/supertone.log` for errors.
4. GPU (ROCm) not required — the sidecar falls back to CPU automatically.

### Qwen TTS not working

1. Check that the Qwen sidecar responds: `curl http://localhost:8300/health`
2. Qwen TTS is GPU-only in this project. If `/health` shows `ready: false` or `device` is not `gpu`, synthesis is intentionally disabled.
3. On first run the `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` model downloads from Hugging Face.
4. On `RX 7600 XT / gfx1102`, use `HSA_OVERRIDE_GFX_VERSION=11.0.0` and `QWEN_TTS_ATTN_IMPLEMENTATION=eager`.
5. Check `.logs/qwen.log` for model load or ROCm/CUDA errors.

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
  "qwenTtsReachable": true,
  "qwenTtsDevice": "gpu"
}
```

### `POST /api/tts`

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","voice":"M1","lang":"en","speed":1.05,"totalSteps":5}' \
  --output speech.wav
```

Returns `audio/wav` binary (44100 Hz, mono).

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
# Due:  GET /api/vocabulary/due?limit=20
```

### Practice

```bash
# Start session
curl -X POST http://localhost:3000/api/practice/start \
  -H "Content-Type: application/json" \
  -d '{"targetLang":"en","nativeLang":"ru","wordCount":10}'

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
- **TTS:** Supertone / supertonic (Python FastAPI, ONNX Runtime, AMD ROCm, port 8100), Kokoro (port 8200), Qwen TTS (port 8300)
- **LLM:** LM Studio (local OpenAI-compatible API, port 1234)
- **Persistence:** SQLite via better-sqlite3 (saved documents, vocabulary SRS, practice sessions)
