(() => {
  'use strict';

  const HISTORY_KEY = 'python-learn-environment-history-v1';
  const MAX_HISTORY = 30;
  const $ = (id) => document.getElementById(id);
  const editor = $('code-editor');
  const output = $('output');
  const runButton = $('run-button');
  const runLabel = $('run-label');
  const status = $('runtime-status');
  const indicator = $('runtime-indicator');
  const historyList = $('history-list');
  const lineNumbers = $('line-numbers');
  let pyodide = null;
  let isRunning = false;
  let toastTimer = null;

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
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
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(history) ? history : [];
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
    } catch {
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
      return `<article class="history-item"><div class="history-info"><span class="history-time">${escapeHtml(time)}</span><span class="history-preview" title="${escapeHtml(firstLine)}">${escapeHtml(preview)}</span><button class="history-load" type="button" data-history-index="${index}">Load code</button></div><span class="history-result ${entry.success ? '' : 'failed'}">${entry.success ? 'Success' : 'Error'}</span></article>`;
    }).join('');
  }

  function setOutput(text, isError = false, duration = null) {
    output.classList.toggle('has-error', isError);
    output.textContent = text || (isError ? 'Python reported an error.' : 'Program finished with no output.');
    $('output-caption').textContent = isError ? 'Your program stopped with an error.' : 'Your program finished successfully.';
    const meta = document.createElement('span');
    meta.className = 'output-meta';
    meta.textContent = duration === null ? 'Output is shown above.' : `Finished in ${duration.toFixed(2)}s`;
    output.appendChild(meta);
  }

  function pythonErrorMessage(error) {
    let message = error && error.message ? error.message : String(error);
    message = message.replace(/^PythonError:\s*/, '');
    return message;
  }

  async function runCode() {
    if (!pyodide || isRunning) return;
    const code = editor.value;
    isRunning = true;
    runButton.disabled = true;
    runLabel.textContent = 'Running…';
    output.classList.remove('has-error');
    output.textContent = '';
    const chunks = [];
    const started = performance.now();

    try {
      pyodide.setStdout({ batched: (text) => chunks.push(text) });
      pyodide.setStderr({ batched: (text) => chunks.push(text) });
      await pyodide.runPythonAsync(code);
      const duration = (performance.now() - started) / 1000;
      const result = chunks.join('\n') + (chunks.length ? '\n' : '');
      setOutput(result, false, duration);
      storeRun(code, true, result);
    } catch (error) {
      const duration = (performance.now() - started) / 1000;
      const result = `${chunks.join('\n')}${chunks.length ? '\n' : ''}${pythonErrorMessage(error)}`;
      setOutput(result, true, duration);
      storeRun(code, false, result);
    } finally {
      pyodide.setStdout({ batched: (text) => { if (text) console.log(text); } });
      pyodide.setStderr({ batched: (text) => { if (text) console.error(text); } });
      isRunning = false;
      runButton.disabled = false;
      runLabel.textContent = 'Run Python';
      status.textContent = 'Python is ready';
    }
  }

  function storeRun(code, success, result) {
    const history = readHistory();
    history.unshift({ code, success, result: String(result).slice(0, 5000), timestamp: new Date().toISOString() });
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
    URL.revokeObjectURL(url);
  }

  async function openPythonFile(file) {
    if (!file) return;
    try {
      editor.value = await file.text();
      updateLineNumbers();
      updateCursorPosition();
      showToast(`Opened ${file.name}`);
    } catch {
      showToast('Unable to read that file.');
    }
    $('file-picker').value = '';
  }

  function bindEditor() {
    editor.addEventListener('input', () => {
      updateLineNumbers();
      updateCursorPosition();
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
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        runCode();
      }
    });
  }

  async function initializePython() {
    if (typeof loadPyodide !== 'function') {
      status.textContent = 'Python runtime unavailable';
      indicator.className = 'status-dot error';
      runLabel.textContent = 'Runtime unavailable';
      showToast('Could not load Python. Check your internet connection and refresh.');
      return;
    }
    try {
      pyodide = await loadPyodide();
      status.textContent = 'Python is ready';
      indicator.className = 'status-dot ready';
      runButton.disabled = false;
      runLabel.textContent = 'Run Python';
    } catch (error) {
      console.error('Pyodide failed to initialize:', error);
      status.textContent = 'Could not start Python';
      indicator.className = 'status-dot error';
      runLabel.textContent = 'Try refreshing';
      showToast('Python could not start. Check your internet connection and refresh.');
    }
  }

  runButton.addEventListener('click', runCode);
  $('clear-output-button').addEventListener('click', () => {
    output.classList.remove('has-error');
    output.innerHTML = '<span class="placeholder">Ready when you are. Run your code to see the output.</span>';
    $('output-caption').textContent = 'Your program’s result will appear here.';
  });
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
  $('save-file-button').addEventListener('click', () => downloadFile('main.py', editor.value, 'text/x-python;charset=utf-8'));
  $('file-picker').addEventListener('change', (event) => openPythonFile(event.target.files[0]));
  document.querySelector('.upload-button').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      $('file-picker').click();
    }
  });
  historyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-history-index]');
    if (!button) return;
    const entry = readHistory()[Number(button.dataset.historyIndex)];
    if (entry) {
      editor.value = entry.code;
      updateLineNumbers();
      updateCursorPosition();
      editor.focus();
      showToast('Previous code loaded into the editor.');
    }
  });

  bindEditor();
  updateLineNumbers();
  updateCursorPosition();
  renderHistory();
  initializePython();
})();
