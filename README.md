# AI Study Buddy 🎓✨

An AI-powered student utility app. Paste your lecture notes and let **Google Gemini** (gemini-3.6-flash by default, configurable via `GEMINI_MODEL`):

- 📝 **Summarize Notes** — key bullet points + core takeaways
- ❓ **Generate Quiz** — 3 multiple-choice questions with an answer key
- 💡 **Explain Simply** — beginner-friendly explanations with real-world analogies

Built with a **vanilla HTML5 + Tailwind CSS (CDN)** frontend and a **Node.js + Express** backend using the official **`@google/genai`** SDK.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Add your Gemini API key

```bash
cp .env.example .env
```

Then open `.env` and replace `your_key_here` with your real key from
[Google AI Studio](https://aistudio.google.com/apikey) (free to create).

> **Windows (CMD) users:** use `copy .env.example .env` instead of `cp`.

### 3. Start the app

```bash
npm start
```

Then open **http://localhost:3000** in your browser.

> Tip: run `npm run dev` instead while developing — the server auto-restarts on file changes (Node 18.11+).

---

## How to Use

1. **Paste notes** into the large text area (at least 20 characters — a live counter shows your progress).
2. **Pick a mode**: Summarize Notes, Generate Quiz, or Explain Simply.
3. Hit **✨ Generate** and wait a few seconds.
4. Read the formatted result and click **Copy to Clipboard** to keep it.

---

## Project Structure

```
ai-study-buddy/
├── package.json          # Dependencies & scripts
├── server.js             # Express backend + Gemini integration
├── .env.example          # Template for your API key
└── public/
    ├── index.html        # UI (Tailwind via CDN)
    └── app.js            # Client logic: validation, fetch, clipboard
```

---

## API Reference

### `POST /api/study-help`

```json
{ "text": "your notes (20–20,000 chars)", "mode": "summarize | quiz | explain" }
```

**Success — 200**

```json
{ "result": "markdown-formatted study help" }
```

**Error — 400 / 502**

```json
{ "error": "human-readable message" }
```

### `GET /api/health`

Returns `{ "ok": true, "modes": ["summarize", "quiz", "explain"] }` — handy for a quick smoke test.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `GEMINI_API_KEY is not set` warning at startup | Create `.env` (see step 2) and restart the server. |
| "API key missing or invalid" error in the app | Double-check the key in `.env` — no quotes, no spaces. |
| "Rate limit reached" | You've hit the free-tier quota; wait a minute and retry. |
| Port 3000 already in use | Set `PORT=3001` in `.env` and restart. |

---

## Notes for Beginners

- The `.env` file holds secrets and must never be committed to git. Add `.env` to `.gitignore` if you publish this project.
- All AI requests go through the backend, so your API key is never exposed to the browser.
- Notes are sent to Gemini only when you click **Generate** — nothing is stored by this app.
