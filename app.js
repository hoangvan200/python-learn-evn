(() => {
  'use strict';

  const HISTORY_KEY = 'python-learn-environment-history-v1';
  const LANGUAGE_KEY = 'python-learn-environment-language-v1';
  const DRAFTS_KEY = 'python-learn-environment-drafts-v1';
  const MAX_HISTORY = 30;
  const MAX_C_SOURCE_LENGTH = 32768;
  const PYODIDE_VERSION = '0.26.2';
  const WANDBOX_API = 'https://wandbox.org/api/compile.json';
  const WANDBOX_COMPILER = 'gcc-13.2.0-c';
  const LANGUAGES = {
    python: {
      name: 'Python', extension: '.py', mime: 'text/x-python;charset=utf-8',
      title: 'Python editor', runtimeName: 'Pyodide',
      hint: 'Tip: use Tab to indent · Ctrl+Enter (⌘+Enter on Mac) to run.',
      runbar: 'Python runs locally in your browser with Pyodide.',
      sample: '# Try changing this program, then click Run.\nname = "Python learner"\nprint(f"Hello, {name}!")\n\nfor number in range(1, 4):\n    print(f"This is run number {number}.")'
    },
    c: {
      name: 'C', extension: '.c', mime: 'text/x-c;charset=utf-8',
      title: 'C editor', runtimeName: 'Wandbox GCC',
      hint: 'Tip: use Tab to indent · Ctrl+Enter (⌘+Enter on Mac) to run.',
      runbar: 'C code is sent to Wandbox and runs remotely. Do not submit secrets or private code.',
      sample: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello from C!\\n");\n    return 0;\n}'
    }
  };

  const $ = (id) => document.getElementById(id);
  const editor = $('code-editor');
  const output = $('output');
  const runButton = $('run-button');
  const runLabel = $('run-label');
  const status = $('runtime-status');
  const indicator = $('runtime-indicator');
  const historyList = $('history-list');
  const lineNumbers = $('line-numbers');
  const languageSelect = $('language-select');
  const filePicker = $('file-picker');

  let currentLanguage = readStoredLanguage();
  let drafts = readDrafts();
  let pyodide = null;
  let pyodidePromise = null;
  let isRunning = false;
  let toastTimer = null;

  function storageGet(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
  function readStoredLanguage() {
    const value = storageGet(LANGUAGE_KEY, 'python');
    return LANGUAGES[value] ? value : 'python';
  }
  function readDrafts() {
    try {
      const value = JSON.parse(storageGet(DRAFTS_KEY, '{}'));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  function saveDraft() {
    drafts[currentLanguage] = editor.value;
    if (!storageSet(DRAFTS_KEY, JSON.stringify(drafts))) showToast('Could not save this draft in browser storage.');
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function setRuntimeStatus(message, state = 'loading') {
    status.textContent = message;
    indicator.className = `status-dot ${state}`;
  }

  function setReadyButton(ready, label = 'Run code') {
    runButton.disabled = isRunning || !ready;
    runLabel.textContent = label;
  }

  function updateLineNumbers() {
    const lineCount = Math.max(1, editor.value.split('\n').length);
    lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
  }

  function updateCursorPosition() {
    const cursor = editor.selectionStart;
    const beforeCursor = editor.value.slice(0, cursor);
    const line = beforeCursor.split('\n').length;
    const column = cursor - beforeCursor.lastIndexOf('\n');
    $('cursor-position').textContent = `Ln ${line}, Col ${column}`;
  }

  function readHistory() {
    try {
      const history = JSON.parse(storageGet(HISTORY_KEY, '[]'));
      return Array.isArray(history) ? history : [];
    } catch { return []; }
  }

  function saveHistory(history) {
    if (!storageSet(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))) {
      showToast('Could not save run history. Browser storage may be full or disabled.');
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function renderHistory() {
    const history = readHistory();
    if (!history.length) {
      historyList.innerHTML = '<p class="empty-history">Your runs will show up here.</p>';
      return;
    }
    historyList.innerHTML = history.map((entry, index) => {
      const date = new Date(entry.timestamp);
      const time = Number.isNaN(date.getTime()) ? 'Previous run' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const firstLine = (entry.code || '').split('\n').find((line) => line.trim()) || 'Empty program';
      const preview = firstLine.length > 52 ? `${firstLine.slice(0, 49)}…` : firstLine;
      const language = LANGUAGES[entry.language] ? entry.language : 'python';
      const label = LANGUAGES[language].name;
      return `<article class="history-item"><div class="history-info"><span class="history-time">${escapeHtml(time)} <span class="history-language">${escapeHtml(label)}</span></span><span class="history-preview" title="${escapeHtml(firstLine)}">${escapeHtml(preview)}</span><button class="history-load" type="button" data-history-index="${index}">Load code</button></div><span class="history-result ${entry.success ? '' : 'failed'}">${entry.success ? 'Success' : 'Error'}</span></article>`;
    }).join('');
  }

  function setOutput(text, isError = false, duration = null) {
    output.classList.toggle('has-error', isError);
    output.textContent = text || (isError ? 'The program reported an error.' : 'Program finished with no output.');
    $('output-caption').textContent = isError ? `${LANGUAGES[currentLanguage].name} program stopped with an error.` : `${LANGUAGES[currentLanguage].name} program finished successfully.`;
    const meta = document.createElement('span');
    meta.className = 'output-meta';
    meta.textContent = duration === null ? 'Output is shown above.' : `Finished in ${duration.toFixed(2)}s`;
    output.appendChild(meta);
  }

  function clearOutput() {
    output.classList.remove('has-error');
    output.innerHTML = '<span class="placeholder">Ready when you are. Run your code to see the output.</span>';
    $('output-caption').textContent = 'Your program’s result will appear here.';
  }

  function setCodeFileType() {
    const language = LANGUAGES[currentLanguage];
    $('editor-title').textContent = language.title;
    $('editor-filename').textContent = `main${language.extension}`;
    $('editor-hint').textContent = language.hint;
    $('runbar-description').textContent = language.runbar;
    $('page-title').textContent = `Learn by running ${language.name}.`;
    $('page-intro').textContent = currentLanguage === 'c'
      ? 'Write a C program and run it with a remote compiler. Your code and run history stay in this browser, but C source is sent to Wandbox when you run it.'
      : 'Write a little code, run it right here, and keep a record of what you’ve tried. Your code and run history stay in this browser.';
    $('language-workspace').setAttribute('aria-label', `${language.name} workspace`);
    editor.setAttribute('aria-label', `${language.name} code editor`);
    filePicker.accept = currentLanguage === 'c' ? '.c,.h,text/x-c,text/plain' : '.py,text/x-python,text/plain';
  }

  function selectLanguage(language, codeOverride = null) {
    if (!LANGUAGES[language]) return;
    if (currentLanguage !== language) saveDraft();
    currentLanguage = language;
    languageSelect.value = language;
    storageSet(LANGUAGE_KEY, language);
    setCodeFileType();
    editor.value = codeOverride ?? (typeof drafts[language] === 'string' ? drafts[language] : LANGUAGES[language].sample);
    drafts[language] = editor.value;
    updateLineNumbers();
    updateCursorPosition();
    clearOutput();
    const ready = language === 'python' ? Boolean(pyodide) : true;
    setReadyButton(ready, ready ? `Run ${LANGUAGES[language].name}` : `Prepare ${LANGUAGES[language].name}…`);
    setRuntimeStatus(ready
      ? (language === 'c' ? 'C ready · compilation runs on Wandbox' : 'Python runtime ready')
      : 'Checking Python runtime…', ready ? 'ready' : 'loading');
  }

  function loadScript(src, key) {
    const existing = document.querySelector(`script[data-runtime="${key}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error(`Could not download ${key}.`)), { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.crossOrigin = 'anonymous';
      script.dataset.runtime = key;
      script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = () => { script.remove(); reject(new Error(`Could not download ${key}. Check your connection and try again.`)); };
      document.head.appendChild(script);
    });
  }

  async function ensurePythonRuntime() {
    if (pyodide) return pyodide;
    if (pyodidePromise) return pyodidePromise;
    pyodidePromise = (async () => {
      setRuntimeStatus('Checking Python runtime…', 'loading');
      setReadyButton(false, 'Loading Python…');
      const base = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
      await loadScript(`${base}pyodide.js`, 'pyodide');
      if (typeof window.loadPyodide !== 'function') throw new Error('Pyodide did not load correctly.');
      pyodide = await window.loadPyodide({ indexURL: base });
      return pyodide;
    })();
    try {
      const runtime = await pyodidePromise;
      if (currentLanguage === 'python') {
        setRuntimeStatus('Python runtime ready', 'ready');
        setReadyButton(true, 'Run Python');
      }
      return runtime;
    } catch (error) {
      pyodidePromise = null;
      if (currentLanguage === 'python') {
        setRuntimeStatus('Python runtime unavailable', 'error');
        setReadyButton(true, 'Retry Python setup');
        showToast(error.message || 'Could not start Python. Check your internet connection and retry.');
      }
      throw error;
    }
  }

  async function ensureCRuntime() {
    if (currentLanguage === 'c') {
      setRuntimeStatus('C ready · compilation runs on Wandbox', 'ready');
      setReadyButton(true, 'Run C');
    }
    return true;
  }

  async function prepareRuntime(language = currentLanguage) {
    try {
      if (language === 'python') await ensurePythonRuntime();
      if (language === 'c') await ensureCRuntime();
    } catch (error) {
      console.error(`${language} runtime setup failed:`, error);
    }
  }

  async function runPython(code) {
    const stdout = [];
    const stderr = [];
    const started = performance.now();
    pyodide.setStdout({ batched: (text) => stdout.push(text) });
    pyodide.setStderr({ batched: (text) => stderr.push(text) });
    try {
      await pyodide.runPythonAsync(code);
      const chunks = [...stdout, ...stderr];
      const result = chunks.join('\n') + (chunks.length ? '\n' : '');
      const duration = (performance.now() - started) / 1000;
      setOutput(result, false, duration);
      storeRun(code, true, result);
    } catch (error) {
      const chunks = [...stdout, ...stderr];
      const detail = error && error.message ? error.message.replace(/^PythonError:\s*/, '') : String(error);
      const result = `${chunks.join('\n')}${chunks.length ? '\n' : ''}${detail}`;
      const duration = (performance.now() - started) / 1000;
      setOutput(result, true, duration);
      storeRun(code, false, result);
    } finally {
      pyodide.setStdout({ batched: (text) => { if (text) console.log(text); } });
      pyodide.setStderr({ batched: (text) => { if (text) console.error(text); } });
    }
  }

  async function runC(code) {
    const started = performance.now();
    if (code.length > MAX_C_SOURCE_LENGTH) {
      throw new Error(`This C editor accepts source up to ${MAX_C_SOURCE_LENGTH.toLocaleString()} characters to limit upload size.`);
    }
    setRuntimeStatus('Sending C source to Wandbox…', 'loading');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let response;
    try {
      response = await fetch(WANDBOX_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compiler: WANDBOX_COMPILER, code, options: '', stdin: '' }),
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Wandbox took too long to respond. Please try again.');
      throw new Error('Could not reach Wandbox. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      if (response.status === 429) throw new Error('Wandbox is rate-limiting requests. Wait a moment and try again.');
      throw new Error(`Wandbox returned HTTP ${response.status}. Please try again later.`);
    }
    const result = await response.json();
    const compileError = result.compiler_error || '';
    const compileOutput = result.compiler_output || '';
    const programOutput = result.program_output || '';
    const programError = result.program_error || '';
    let message = [compileOutput, compileError, programOutput, programError].filter(Boolean).join('\n');
    if (message.length > 12000) message = `${message.slice(0, 12000)}\n[Output truncated]`;
    const duration = (performance.now() - started) / 1000;
    const success = String(result.status) === '0';
    const display = message || (success ? 'Program finished with no output.' : `C program exited with status ${result.status || 'unknown'}.`);
    setOutput(display, !success, duration);
    storeRun(code, success, display);
    setRuntimeStatus('C ready · compilation runs on Wandbox', 'ready');
  }

  async function runCode() {
    if (isRunning) return;
    if (currentLanguage === 'python' && !pyodide) {
      await prepareRuntime();
      return;
    }
    const code = editor.value;
    saveDraft();
    isRunning = true;
    runButton.disabled = true;
    runLabel.textContent = `Running ${LANGUAGES[currentLanguage].name}…`;
    output.classList.remove('has-error');
    output.textContent = '';
    const started = performance.now();
    try {
      if (currentLanguage === 'python') await runPython(code);
      else await runC(code);
    } catch (error) {
      console.error(`${currentLanguage} execution failed:`, error);
      const duration = (performance.now() - started) / 1000;
      const message = error && error.message ? error.message : String(error);
      setOutput(message, true, duration);
      storeRun(code, false, message);
    } finally {
      isRunning = false;
      setReadyButton(true, `Run ${LANGUAGES[currentLanguage].name}`);
      setRuntimeStatus(currentLanguage === 'c' ? 'C ready · compilation runs on Wandbox' : 'Python runtime ready', 'ready');
    }
  }

  function storeRun(code, success, result) {
    const history = readHistory();
    history.unshift({ language: currentLanguage, code, success, result: String(result).slice(0, 5000), timestamp: new Date().toISOString() });
    saveHistory(history);
    renderHistory();
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function openSourceFile(file) {
    if (!file) return;
    const isCFile = /\.(c|h)$/i.test(file.name);
    const targetLanguage = isCFile ? 'c' : 'python';
    selectLanguage(targetLanguage, await file.text());
    drafts[targetLanguage] = editor.value;
    storageSet(DRAFTS_KEY, JSON.stringify(drafts));
    showToast(`Opened ${file.name}`);
    filePicker.value = '';
    prepareRuntime(targetLanguage);
  }

  function bindEditor() {
    editor.addEventListener('input', () => {
      updateLineNumbers();
      updateCursorPosition();
      saveDraft();
    });
    editor.addEventListener('click', updateCursorPosition);
    editor.addEventListener('keyup', updateCursorPosition);
    editor.addEventListener('scroll', () => { lineNumbers.scrollTop = editor.scrollTop; });
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.setRangeText('    ', start, end, 'end');
        updateLineNumbers();
        updateCursorPosition();
        saveDraft();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        runCode();
      }
    });
  }

  languageSelect.addEventListener('change', () => {
    if (isRunning) {
      languageSelect.value = currentLanguage;
      return;
    }
    const language = languageSelect.value;
    selectLanguage(language);
    prepareRuntime(language);
  });
  runButton.addEventListener('click', runCode);
  $('clear-output-button').addEventListener('click', clearOutput);
  $('clear-history-button').addEventListener('click', () => {
    if (!readHistory().length) return;
    if (window.confirm('Clear all saved run history from this browser?')) {
      try {
        localStorage.removeItem(HISTORY_KEY);
        renderHistory();
        showToast('Run history cleared.');
      } catch {
        showToast('Could not clear run history. Browser storage may be disabled.');
      }
    }
  });
  $('save-file-button').addEventListener('click', () => {
    const language = LANGUAGES[currentLanguage];
    downloadFile(`main${language.extension}`, editor.value, language.mime);
  });
  filePicker.addEventListener('change', (event) => openSourceFile(event.target.files[0]).catch((error) => showToast(error.message)));
  $('open-file-button').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      filePicker.click();
    }
  });
  historyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-history-index]');
    if (!button) return;
    const entry = readHistory()[Number(button.dataset.historyIndex)];
    if (!entry) return;
    const language = LANGUAGES[entry.language] ? entry.language : 'python';
    selectLanguage(language, entry.code || '');
    drafts[language] = editor.value;
    storageSet(DRAFTS_KEY, JSON.stringify(drafts));
    editor.focus();
    prepareRuntime(language);
    showToast(`Loaded previous ${LANGUAGES[language].name} code into the editor.`);
  });

  bindEditor();
  renderHistory();
  selectLanguage(currentLanguage);
  prepareRuntime(currentLanguage);
})();
