# Python Learn Environment

A responsive, browser-based workspace for learning Python. Write code, run it with Pyodide, view standard output and errors, and revisit recent runs saved in your browser.

## Requirements

- A modern browser with JavaScript and WebAssembly support.
- An internet connection to load Pyodide and web fonts from their CDNs.

This is a static site and has **no npm, bundler, or backend dependencies to install**. The Python runtime (Pyodide 0.26.2) is loaded by the page from jsDelivr. Python code runs locally in the browser after the runtime has loaded.

## Run locally

From this folder, start Python's built-in static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a modern browser. You can also host the files on any static web host that serves `index.html`.

## Features

- Run Python in the browser using Pyodide.
- View standard output and Python errors, with execution time.
- Use Tab for four-space indentation and Ctrl+Enter (or Command+Enter) to run.
- Open and save `.py` files.
- Keep the latest 30 runs in browser local storage; load a previous run back into the editor or clear the history.
- Responsive editor and output panels for desktop, tablet, and mobile screens.
- Subtle interaction and entrance animations that respect the operating system's reduced-motion preference.
- No account or application server required.

## Checks

There is no compile/build step. To check the JavaScript syntax:

```bash
node --check app.js
```

## Privacy and limitations

Run history is stored in this browser's local storage and is not sent to an application server. Clearing browser site data removes it. The runtime and fonts are loaded from third-party CDNs. This is a learning environment, not a security sandbox for untrusted code; Pyodide executes code inside the page's browser context. Python programs that expect a terminal or interactive `input()` prompt are not supported by this simple interface.
