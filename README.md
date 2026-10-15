# Code Learn Environment

A responsive learning workspace for Python and C. Write code in a full editor, run it, view output and errors, and revisit recent runs saved in your browser.

## Requirements

Visitors need a modern browser with JavaScript and WebAssembly enabled, plus an internet connection for Pyodide and remote C compilation. The editor itself is bundled with the site and does not fetch CodeMirror modules from a CDN.

Development and production builds use Node.js 22.12 or later and npm. GitHub Pages installs the locked dependencies, runs the Vite build, and deploys the generated `dist/` directory.

Python runs locally in the browser using Pyodide 0.26.2 from jsDelivr. C source is sent directly from the browser to Wandbox and compiled with GCC 13.2.0. This avoids downloading a large Clang toolchain to each visitor's device. C source is limited to 32,768 characters per run. A transient sandbox startup resource error is retried once; the public service may still be temporarily unavailable or rate-limited.

## Run locally

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To create and preview a production build:

```bash
npm run build
npm run preview
```

## Publish with GitHub Pages

The `Deploy static content to Pages` workflow builds and publishes the site to GitHub Pages when changes are pushed to `main`, or when started manually from the Actions tab. The public URL is:

<https://hoangvan200.github.io/python-learn-evn/>

In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source.

## Editor and workspace features

- CodeMirror 6 provides syntax colors and line numbers for Python and C.
- Press Tab to indent by four spaces; Shift+Tab decreases indentation. Language-aware Enter indentation, bracket matching, and closing brackets are enabled.
- Suggestions appear while typing. Use Ctrl+Space (or Command+Space on Mac) or the **Suggestions** button to open them. Python suggestions include built-ins, local names, and starter snippets; C suggestions include common keywords and standard-library calls. Press Enter to accept a suggestion. These are local, rule-based suggestions—not AI or a language server.
- Press Ctrl+Enter (or Command+Enter on Mac) to run the current program.
- Open and save `.py` and `.c` files; switch languages without losing each draft.
- Keep the latest 30 runs in browser local storage, load a previous run into the editor, or clear the history.
- Responsive editor and output panels for desktop, tablet, and mobile. Subtle interaction and suggestion animations respect the operating system's reduced-motion preference.

## Checks

```bash
npm ci
npm run build
node --check app.js
node --check code-editor.js
```

## Privacy and limitations

Run history and code drafts are stored in this browser's local storage. Clearing browser site data removes them. Python code executes locally in Pyodide. **When you run C, the source code and stdin are transmitted to Wandbox and executed on its servers. Do not submit secrets, credentials, personal data, or private code.** Wandbox states in its [source repository](https://github.com/melpon/wandbox) that it provides no SLA and applies restrictions to repeated access from the same IP. Remote C runs can therefore be delayed, rate-limited, or temporarily unavailable. See [Wandbox](https://wandbox.org/) for the service. This is a learning environment, not a security sandbox for code you do not trust. Interactive terminal input (`input()` in Python or `scanf()` in C) is not supported by this simple interface.

The legacy `coi-serviceworker.js` file remains published so browsers with the previous local C runtime's service worker can update or clear its registration; new visits do not load it.
