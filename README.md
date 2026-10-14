# Code Learn Environment

A responsive workspace for learning Python and C. Write code, run Python locally or compile C remotely, view output and errors, and revisit recent runs saved in your browser.

## Requirements

- A modern browser with JavaScript and WebAssembly support.
- An internet connection to load Pyodide and web fonts, and to contact Wandbox for C runs.

This is a static site and has **no build step or server-side dependencies to install**. Python uses Pyodide 0.26.2 from jsDelivr. C source is sent directly from the browser to the Wandbox compile API and compiled with GCC 13.2.0 on Wandbox's servers. This removes the browser's first-run Clang download (about 100 MB); each C run uploads only the source text and receives the output. C source is limited to 32,768 characters per run, and a transient sandbox startup resource error is retried once. GitHub Pages remains the static host; no application backend is required.

## Run locally

From this folder, start Python's built-in static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a modern browser. You can also host the files on any static web host that serves `index.html`.

## Publish with GitHub Pages

The repository includes a GitHub Actions workflow that publishes the site to GitHub Pages whenever changes are pushed to `main`, or when the workflow is started manually. The published site URL is:

<https://hoangvan200.github.io/python-learn-evn/>

In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. The first deployment will run automatically after the Pages site is enabled and the workflow is pushed.

## Features

- Run Python in the browser using Pyodide.
- Switch to C and compile/run it on Wandbox without downloading a compiler to the device.
- Keep Python execution local in Pyodide; only C source and input are sent to the remote compiler.
- View program output and compile/runtime errors, with execution time.
- Use Tab for four-space indentation and Ctrl+Enter (or Command+Enter) to run.
- Open and save `.py` and `.c` files.
- Keep the latest 30 runs in browser local storage; load a previous run back into the editor or clear the history.
- Responsive editor and output panels for desktop, tablet, and mobile screens.
- Subtle interaction and entrance animations that respect the operating system's reduced-motion preference.
- No account or project-owned application server required.

## Checks

There is no compile/build step. To check the JavaScript syntax:

```bash
node --check app.js
```

## Privacy and limitations

Run history and code drafts are stored in this browser's local storage. Clearing browser site data removes them. Python code executes locally in Pyodide. **When you run C, the source code and stdin are transmitted to Wandbox and executed on its servers. Do not submit secrets, credentials, personal data, or private code.** Wandbox states in its [source repository](https://github.com/melpon/wandbox) that it provides no SLA and applies restrictions to repeated access from the same IP, so remote compilation can be unavailable or rate-limited. See [Wandbox](https://wandbox.org/) for the service. This is a learning environment, not a security sandbox for code you do not trust. Interactive terminal input (`input()` in Python or `scanf()` in C) is not supported by this simple interface.

The legacy `coi-serviceworker.js` file is retained for browsers that may still have the previous local C runtime's service worker registered; new visits no longer load it.
