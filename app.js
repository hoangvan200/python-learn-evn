(() => {
  'use strict';

  const HISTORY_KEY = 'python-learn-environment-history-v1';
  const LANGUAGE_KEY = 'python-learn-environment-language-v1';
  const DRAFTS_KEY = 'python-learn-environment-drafts-v1';
  const MAX_HISTORY = 30;
  const PYODIDE_VERSION = '0.26.2';
  const WASMER_SDK_VERSION = '0.8.0';
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
      title: 'C editor', runtimeName: 'Clang for WebAssembly',
      hint: 'Tip: use Tab to indent · Ctrl+Enter (⌘+Enter on Mac) to run.',
      runbar: 'C runs locally in a WebAssembly sandbox. First setup downloads Clang (about 100 MB); your browser normally reuses it from its cache.',
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
  let wasmerPromise = null;
  let cCompilerSandbox = null;
  let legacyWasmer = null;
  let Directory = null;
  let cCompilerPromise = null;
  let coiScriptPromise = null;
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
      ? 'Write a C program, compile it in your browser, and keep a record of what you’ve tried. Your code and run history stay in this browser.'
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
    const ready = language === 'python' ? Boolean(pyodide) : Boolean(cCompilerSandbox);
    setReadyButton(ready, ready ? `Run ${LANGUAGES[language].name}` : `Prepare ${LANGUAGES[language].name}…`);
    setRuntimeStatus(ready ? `${LANGUAGES[language].name} runtime ready` : `Checking ${LANGUAGES[language].name} runtime…`, ready ? 'ready' : 'loading');
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

  function loadCoiScript() {
    if (window.crossOriginIsolated) return Promise.resolve();
    if (!window.isSecureContext || !('serviceWorker' in navigator)) {
      return Promise.reject(new Error('C requires a secure browser with Service Worker support. Open the HTTPS site in a modern browser.'));
    }
    if (coiScriptPromise) return coiScriptPromise;
    coiScriptPromise = loadScript('coi-serviceworker.js', 'coi-serviceworker')
      .then(async () => {
        await navigator.serviceWorker.ready;
        if (!window.crossOriginIsolated) {
          setRuntimeStatus('Enabling C runtime support… the page will refresh once', 'loading');
          setTimeout(() => window.location.reload(), 400);
          return new Promise(() => {});
        }
      });
    return coiScriptPromise;
  }

  async function ensureCRuntime() {
    if (cCompilerSandbox) return cCompilerSandbox;
    if (cCompilerPromise) return cCompilerPromise;
    cCompilerPromise = (async () => {
      setRuntimeStatus('Checking browser support for C…', 'loading');
      setReadyButton(false, 'Preparing C…');
      await loadCoiScript();
      if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
        throw new Error('The browser could not enable the isolated WebAssembly runtime required by C. Try reloading the page or use a current browser.');
      }
      setRuntimeStatus('Checking C compiler… first setup downloads Clang (about 100 MB)', 'loading');
      if (!wasmerPromise) {
        wasmerPromise = import(`https://unpkg.com/@wasmer/sdk@${WASMER_SDK_VERSION}/dist/index.mjs`)
          .then(async (sdk) => {
            await sdk.init();
            legacyWasmer = sdk.Wasmer;
            Directory = sdk.Directory;
            return sdk.Wasmer.fromRegistry('clang/clang');
          });
      }
      cCompilerSandbox = await wasmerPromise;
      return cCompilerSandbox;
    })();
    try {
      const runtime = await cCompilerPromise;
      if (currentLanguage === 'c') {
        setRuntimeStatus('C compiler ready', 'ready');
        setReadyButton(true, 'Run C');
      }
      return runtime;
    } catch (error) {
      cCompilerPromise = null;
      wasmerPromise = null;
      legacyWasmer = null;
      Directory = null;
      if (currentLanguage === 'c') {
        setRuntimeStatus('C runtime unavailable', 'error');
        setReadyButton(true, 'Retry C setup');
        showToast(error.message || 'Could not install the C runtime. Check your connection and retry.');
      }
      throw error;
    }
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

  function decodeLegacyOutput(value) {
    if (typeof value === 'string') return value;
    if (value instanceof Uint8Array) return new TextDecoder().decode(value);
    if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value));
    if (value && value.buffer instanceof ArrayBuffer) return new TextDecoder().decode(value);
    return value == null ? '' : String(value);
  }

  function getLegacyProcessText(result) {
    return [decodeLegacyOutput(result && result.stdout), decodeLegacyOutput(result && result.stderr)].filter(Boolean).join('\n');
  }

  async function runC(code) {
    const started = performance.now();
    const compiler = await ensureCRuntime();
    const project = new Directory();
    await project.writeFile('main.c', code);
    const compileInstance = await compiler.entrypoint.run({
      args: ['/project/main.c', '-o', '/project/main.wasm'],
      mount: { '/project': project }
    });
    const compile = await compileInstance.wait();
    const compileText = getLegacyProcessText(compile);
    if (!compile.ok) {
      const duration = (performance.now() - started) / 1000;
      const result = compileText || `C compilation failed (exit code ${compile.code ?? compile.exitCode ?? 'unknown'}).`;
      setOutput(result, true, duration);
      storeRun(code, false, result);
      return;
    }

    const wasmBytes = await project.readFile('main.wasm');
    const executable = await legacyWasmer.fromFile(wasmBytes);
    const runInstance = await executable.entrypoint.run();
    const result = await runInstance.wait();
    const text = getLegacyProcessText(result);
    const duration = (performance.now() - started) / 1000;
    const success = Boolean(result.ok);
    const exitCode = result.code ?? result.exitCode;
    const display = text || (success ? 'Program finished with no output.' : `C program exited with code ${exitCode ?? 'unknown'}.`);
    setOutput(display, !success, duration);
    storeRun(code, success, display);
  }

  async function runCode() {
    if (isRunning) return;
    if ((currentLanguage === 'python' && !pyodide) || (currentLanguage === 'c' && !cCompilerSandbox)) {
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
      setRuntimeStatus(`${LANGUAGES[currentLanguage].name} runtime ready`, 'ready');
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
