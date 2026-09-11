/**
 * AI Study Buddy — Express backend
 *
 * Exposes POST /api/study-help which forwards student notes to
 * Gemini 2.5 Flash through the official @google/genai SDK and returns
 * study-friendly markdown. The static frontend is served from /public.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const app = express();
// Ignore invalid PORT values (e.g. PORT=0 or PORT=abc) and fall back to 3000.
const parsedPort = Number.parseInt(process.env.PORT, 10);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// gemini-2.5-flash is no longer available to new API keys; 3.6-flash is the
// current default. Override with GEMINI_MODEL in .env if needed.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const MIN_TEXT_LENGTH = 20;
const MAX_TEXT_LENGTH = 20000;
const API_TIMEOUT_MS = 120000; // Gemini can take 30-60s+ on new keys / cold starts

// System prompts tuned per utility mode. Each tells the model exactly what
// shape, tone, and structure the student expects back.
const MODES = {
  summarize: {
    label: 'Summarize Notes',
    systemPrompt: `You are a study assistant helping a student condense lecture notes.
Produce a concise study summary in markdown with exactly two sections:

## Key Points
- 5 to 8 short bullet points covering the essential facts, definitions, and concepts from the notes.
- Keep each bullet under 20 words. Preserve the original order of ideas.

## Core Takeaways
- 2 to 4 bullets capturing the big-picture meaning: why the material matters and how ideas connect.

Rules:
- Use only information present in the notes. Do not invent facts.
- Keep technical terms intact, but add a short plain-language gloss in parentheses for jargon.
- If the notes are too fragmented to summarize, say so under a single "Note:" line instead of guessing.`,
  },
  quiz: {
    label: 'Generate Quiz',
    systemPrompt: `You are a quiz generator for students. Based on the provided notes, create exactly 3 multiple-choice questions in markdown.

Format each question exactly like this:

**Question 1.** <question text> (topic: <short topic>)
- A. <option>
- B. <option>
- C. <option>
- D. <option>

After the three questions add:

## Answer Key
1. <letter> — <one-sentence explanation of why it is correct>

Rules:
- Questions must be answerable from the notes only.
- Exactly one option is correct; distractors must be plausible but clearly wrong.
- Cover three different concepts from the notes, not three variations of one idea.
- Mix up which letter is correct across questions.`,
  },
  explain: {
    label: 'Explain Simply',
    systemPrompt: `You are a friendly tutor who explains academic material to beginners.
Explain the provided notes in markdown with exactly three sections:

## Simple Explanation
- A short paragraph (3-6 sentences) in plain language assuming no prior knowledge.

## Real-World Analogies
- 1 to 3 bullets, each comparing a concept from the notes to an everyday situation (e.g. "A neuron works like a relay race runner...").

## Quick Recap
- 2 to 4 one-line bullets a student could use as memory hooks.

Rules:
- Avoid jargon; when a technical term is unavoidable, define it in the same sentence.
- Analogies must map clearly onto the concept's actual mechanism.
- Never fabricate details that are not supported by the notes.`,
  },
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateRequest(body) {
  const { text, mode } = body || {};

  if (typeof text !== 'string' || text.trim().length < MIN_TEXT_LENGTH) {
    return `Please paste at least ${MIN_TEXT_LENGTH} characters of notes so the AI has something to work with.`;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return `Your notes are too long (${text.length} characters). Please limit input to ${MAX_TEXT_LENGTH} characters.`;
  }
  if (typeof mode !== 'string' || !(mode in MODES)) {
    return 'Please choose a valid study mode (Summarize, Quiz, or Explain).';
  }
  return null;
}

// Calls Gemini with a hard timeout so a hung request can't stall the server.
async function generateStudyHelp(text, mode) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('The AI request timed out. Please try again.')), API_TIMEOUT_MS)
  );

  const call = ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      systemInstruction: MODES[mode].systemPrompt,
      temperature: mode === 'quiz' ? 0.6 : 0.4,
    },
  });

  const response = await Promise.race([call, timeout]);

  const result = response?.text;
  if (!result || !result.trim()) {
    throw new Error('The AI returned an empty response. Please try rephrasing your notes.');
  }
  return result.trim();
}

// Turns SDK errors into safe, user-facing messages without leaking internals.
function toUserFacingError(err) {
  const message = err?.message || '';
  const status = err?.status || err?.code;

  if (status === 404 || /no longer available|not found for api|model.*not.*found/i.test(message)) {
    return 'The configured AI model is not available for this API key. Set GEMINI_MODEL in your .env file to an available model (e.g. gemini-3.6-flash).';
  }
  if (status === 429 || /rate.?limit|quota|resource.?exhausted/i.test(message)) {
    return 'Rate limit reached — the AI is receiving too many requests. Wait a moment and try again.';
  }
  if (status === 401 || status === 403 || /api.?key|unauthenticated|permission|default credentials|authentication/i.test(message)) {
    return 'The server API key is missing or invalid. Check GEMINI_API_KEY in your .env file.';
  }
  if (status === 503 || /overloaded|unavailable/i.test(message)) {
    return 'The AI service is temporarily overloaded. Please try again shortly.';
  }
  if (/timed out|timeout/i.test(message)) {
    return 'The AI request timed out. Please try again with a shorter selection of notes.';
  }
  if (/fetch|network|enotfound|econnrefused/i.test(message)) {
    return 'Network error while contacting the AI service. Check your internet connection.';
  }
  return 'Something went wrong while generating your study help. Please try again.';
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, modes: Object.keys(MODES) });
});

app.post('/api/study-help', async (req, res) => {
  const validationError = validateRequest(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { text, mode } = req.body;

  try {
    const result = await generateStudyHelp(text, mode);
    res.json({ result });
  } catch (err) {
    console.error(`[study-help] mode=${mode} failed:`, err?.message || err);
    res.status(502).json({ error: toUserFacingError(err) });
  }
});

// Fallback for unknown API routes so the SPA never receives HTML errors.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown API endpoint.' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    '⚠  GEMINI_API_KEY is not set. Copy .env.example to .env and add your key from https://aistudio.google.com/apikey'
  );
}

app.listen(PORT, () => {
  console.log(`✅ AI Study Buddy running at http://localhost:${PORT}`);
});

module.exports = app;
