/**
 * AI Study Buddy — client-side logic
 *
 * Handles input validation, mode selection, API calls to /api/study-help,
 * markdown rendering (sanitized), copy-to-clipboard, and error display.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Constants & DOM references
  // ------------------------------------------------------------------

  const MIN_CHARS = 20;
  const MAX_CHARS = 20000;

  const el = {
    textarea: document.getElementById('notes-input'),
    charCounter: document.getElementById('char-counter'),
    modeButtons: document.querySelectorAll('#mode-selector .mode-btn'),
    generateBtn: document.getElementById('generate-btn'),
    btnLabel: document.getElementById('btn-label'),
    spinner: document.getElementById('spinner'),
    errorBox: document.getElementById('error-box'),
    errorMessage: document.getElementById('error-message'),
    outputSection: document.getElementById('output-section'),
    outputTitle: document.getElementById('output-title'),
    outputDisplay: document.getElementById('output-display'),
    copyBtn: document.getElementById('copy-btn'),
    copyLabel: document.getElementById('copy-label'),
  };

  const MODE_META = {
    summarize: { title: 'Summarize Notes', btn: '✨ Generate' },
    quiz: { title: 'Generate Quiz', btn: '❓ Generate Quiz' },
    explain: { title: 'Explain Simply', btn: '💡 Explain Simply' },
  };

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  const state = {
    mode: 'summarize', // default selection
    busy: false,
    lastResult: '',
    copyResetTimer: null,
  };

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  function getValidationError() {
    const value = el.textarea.value.trim();
    if (value.length === 0) {
      return 'Please paste some notes first — the input cannot be empty.';
    }
    if (value.length < MIN_CHARS) {
      return `Notes are too short — please enter at least ${MIN_CHARS} characters (you have ${value.length}).`;
    }
    return null;
  }

  function showValidationFeedback(message) {
    showError(message);
    el.textarea.classList.add('border-red-300', 'ring-2', 'ring-red-200');
    el.textarea.focus();
  }

  function clearValidationError() {
    el.textarea.classList.remove('border-red-300', 'ring-2', 'ring-red-200');
  }

  // ------------------------------------------------------------------
  // Error / output helpers
  // ------------------------------------------------------------------

  function showError(message) {
    el.errorMessage.textContent = message;
    el.errorBox.classList.remove('hidden');
  }

  function hideError() {
    el.errorBox.classList.add('hidden');
  }

  function renderResult(markdown, modeKey) {
    const meta = MODE_META[modeKey] || { title: 'Result' };
    el.outputTitle.textContent = meta.title;

    // Sanitize before rendering markdown as HTML (XSS-safe)
    const clean = DOMPurify.sanitize(marked.parse(markdown));
    el.outputDisplay.innerHTML = clean;
    el.outputSection.classList.remove('hidden');

    // Scroll output into view on small screens
    if (window.innerWidth < 640) {
      el.outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ------------------------------------------------------------------
  // Copy to clipboard
  // ------------------------------------------------------------------

  async function copyToClipboard() {
    if (!state.lastResult) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(state.lastResult);
      } else {
        // Fallback for older browsers / non-HTTPS contexts
        const ta = document.createElement('textarea');
        ta.value = state.lastResult;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      el.copyLabel.textContent = 'Copied!';
      clearTimeout(state.copyResetTimer);
      state.copyResetTimer = setTimeout(() => {
        el.copyLabel.textContent = 'Copy to Clipboard';
      }, 2000);
    } catch (err) {
      showError('Could not copy to clipboard. Please copy the text manually.');
    }
  }

  // ------------------------------------------------------------------
  // Loading state
  // ------------------------------------------------------------------

  function setLoading(isLoading) {
    state.busy = isLoading;
    el.generateBtn.disabled = isLoading;
    el.spinner.classList.toggle('hidden', !isLoading);
    el.btnLabel.textContent = isLoading ? 'Working…' : MODE_META[state.mode].btn;
    el.modeButtons.forEach(b => (b.disabled = isLoading));
  }

  // ------------------------------------------------------------------
  // API call
  // ------------------------------------------------------------------

  async function fetchStudyHelp(text, mode) {
    const res = await fetch('/api/study-help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode }),
    });

    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      // Response wasn't JSON (e.g. proxy/HTML error page)
    }

    if (!res.ok) {
      throw new Error(data.error || `Server error (${res.status}). Please try again.`);
    }
    return data.result;
  }

  // ------------------------------------------------------------------
  // Event wiring
  // ------------------------------------------------------------------

  function selectMode(btn) {
    state.mode = btn.dataset.mode;
    el.modeButtons.forEach(b => {
      const selected = b === btn;
      b.setAttribute('aria-pressed', String(selected));
      const base = 'px-4 py-3 rounded-xl text-sm font-medium border transition text-left ';
      if (selected) {
        b.className = base + 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500';
      } else {
        b.className = base + 'border-slate-200 bg-white text-slate-600 hover:border-slate-300';
      }
    });
  }

  async function handleGenerate() {
    if (state.busy) return;

    hideError();
    const error = getValidationError();
    if (error) {
      showValidationFeedback(error);
      return;
    }
    clearValidationError();

    const text = el.textarea.value.trim();
    setLoading(true);

    try {
      const result = await fetchStudyHelp(text, state.mode);
      state.lastResult = result;
      renderResult(result, state.mode);
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
      el.generateBtn.focus();
    }
  }

  el.modeButtons.forEach(btn => {
    btn.addEventListener('click', () => selectMode(btn));
  });

  el.textarea.addEventListener('input', () => {
    const len = el.textarea.value.length;
    el.charCounter.textContent = `${len.toLocaleString()} / 20,000 characters`;
    if (len >= MIN_CHARS) clearValidationError();
    if (len > MAX_CHARS) {
      el.textarea.value = el.textarea.value.slice(0, MAX_CHARS);
    }
  });

  el.generateBtn.addEventListener('click', handleGenerate);
  el.copyBtn.addEventListener('click', copyToClipboard);

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------

  el.charCounter.textContent = '0 / 20,000 characters';
})();
