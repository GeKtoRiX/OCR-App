# OCR-App

Web application for extracting text from images. Upload a screenshot, photo of a document, or any image containing text — the app will extract the text and format it as Markdown.

**Everything runs locally.** No data is sent to the cloud.

---

## How it works

```
Image → PaddleOCR (recognition) → LM Studio (Markdown formatting) → Result
```

1. **PaddleOCR** — fast OCR engine running as a separate local sidecar in the Linux host environment. Supports GPU (AMD ROCm) and CPU.
2. **LM Studio** — local LLM server. Used only to structure raw OCR text into readable Markdown.

---

## Requirements

| Component | Version |
|-----------|---------|
| [Node.js](https://nodejs.org/) | 20+ |
| [LM Studio](https://lmstudio.ai/) | Latest |
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

### 3. Install dependencies

```bash
npm install
```

### 4. Start the PaddleOCR sidecar

```bash
cd paddleocr-service
python3.10 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install paddlepaddle-gpu==2.6.2 -f https://www.paddlepaddle.org.cn/whl/linux/rocm/stable.html
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 5. Start the app

**Windows** — double-click `scripts\windows\start.bat`

**Linux / macOS:**
```bash
chmod +x scripts/linux/ocr.sh
./scripts/linux/ocr.sh start
```

The script checks env, LM Studio and the PaddleOCR sidecar, builds the app if needed, starts the backend, and opens the browser automatically.

**Done!** The app will open at [http://localhost:3000](http://localhost:3000).

### Stop

**Windows** — double-click `scripts\windows\stop.bat`

**Linux / macOS:**
```bash
./scripts/linux/ocr.sh stop
```

### Full wipe

**Windows** — double-click `scripts\windows\kill.bat`

**Linux / macOS:**
```bash
./scripts/linux/ocr.sh wipe
```

Stops the app and removes all build artifacts. Host-side PaddleOCR files are not touched.

### Status

```bash
./scripts/linux/ocr.sh status
```

Shows current env config, service health (LM Studio, PaddleOCR), and backend process state.

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

### Status indicator

A color-coded indicator in the corner shows service health:

| Color | Status |
|-------|--------|
| Green | PaddleOCR running on GPU |
| Yellow | PaddleOCR running on CPU |
| Red | One or more services are unavailable |

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

# Server
PORT=3000
```

### AMD GPU (ROCm)

PaddleOCR is expected to use the ROCm stack already installed in your Linux environment.
Start the sidecar there and keep it listening on port `8000`.

If your ROCm setup needs it, export the override before starting the sidecar:

```bash
export HSA_OVERRIDE_GFX_VERSION=11.0.1
```

---

## Development mode

```bash
# Install dependencies
npm install

# Start backend (port 3000)
npm run dev:backend

# Start frontend (port 5173)
npm run dev:frontend

# Start PaddleOCR sidecar on the host (requires Python + dependencies)
python -m uvicorn --app-dir paddleocr-service main:app --host 0.0.0.0 --port 8000
```

App is available at [http://localhost:5173](http://localhost:5173).

---

## Troubleshooting

### App does not open / connection error

1. Check that the backend started: `curl http://localhost:3000/api/health`
2. Check the terminal where you ran `start.sh` / `start.bat` for errors.

### Red indicator / OCR not working

1. Check that the host sidecar responds: `curl http://localhost:8000/health`
2. On first run the model downloads in ~1–2 minutes — wait for it.
3. Check the sidecar process logs in your Linux environment.

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
  "lmStudioModels": ["qwen/qwen3.5-9b"]
}
```

---

## Tech stack

- **Backend:** NestJS 10 (TypeScript)
- **Frontend:** React 18 + Vite 6 (TypeScript)
- **OCR:** PaddleOCR (Python FastAPI, AMD ROCm)
- **LLM:** LM Studio (local OpenAI-compatible API)
