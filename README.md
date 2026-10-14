# Code Learn Environment

A responsive, browser-based workspace for learning Python and C. Write code, run it in a WebAssembly runtime, view output and errors, and revisit recent runs saved in your browser.

## Requirements

- A modern browser with JavaScript and WebAssembly support.
- An internet connection to load language runtimes and web fonts on demand.

This is a static site and has **no build step or server-side dependencies to install**. Python uses Pyodide 0.26.2 from jsDelivr. C uses the official browser Clang integration (`@wasmer/sdk` 0.8.0) and the `clang/clang` package from the Wasmer registry. Selecting a language checks and initializes its runtime; missing packages are fetched automatically. The first C setup downloads a large compiler package (about 100 MB); the browser's normal HTTP cache can reuse it on later visits. The C runtime requires HTTPS, a modern browser with WebAssembly and SharedArrayBuffer support, and a service worker; on GitHub Pages, the service worker enables the required cross-origin isolation and may reload the page once when C is first selected.

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
- Switch to C and compile/run C programs with Clang in WebAssembly, without a backend.
- Load each language runtime only when selected and reuse cached runtime packages on later visits.
- View program output and compile/runtime errors, with execution time.
- Use Tab for four-space indentation and Ctrl+Enter (or Command+Enter) to run.
- Open and save `.py` and `.c` files.
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

Run history and code drafts are stored in this browser's local storage and are not sent to an application server. Clearing browser site data removes them. Runtime packages and fonts are loaded from third-party CDNs/registries. Python and C source code execute locally in browser WebAssembly runtimes; the source is not sent to an application server. This is a learning environment, not a security sandbox for untrusted code. Interactive terminal input (`input()` in Python or `scanf()` in C) is not supported by this simple interface.

The C runtime uses the MIT-licensed `coi-serviceworker` v0.1.7 to enable cross-origin isolation on GitHub Pages; see [COI-SERVICEWORKER-LICENSE](COI-SERVICEWORKER-LICENSE).
