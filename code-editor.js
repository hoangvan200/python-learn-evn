import { cpp, cppLanguage } from '@codemirror/lang-cpp';
import { python, pythonLanguage } from '@codemirror/lang-python';
import { completeFromList, snippet, startCompletion } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from 'codemirror';
import { indentUnit } from '@codemirror/language';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

const pythonSnippets = completeFromList([
  { label: 'print()', type: 'function', detail: 'Python snippet', apply: snippet('print(${})') },
  { label: 'for … in …', type: 'keyword', detail: 'Loop snippet', apply: snippet('for ${item} in ${iterable}:\n    ${}') },
  { label: 'def …', type: 'keyword', detail: 'Function snippet', apply: snippet('def ${name}(${args}):\n    ${}') },
  { label: 'if …', type: 'keyword', detail: 'Condition snippet', apply: snippet('if ${condition}:\n    ${}') },
  { label: 'class …', type: 'keyword', detail: 'Class snippet', apply: snippet('class ${Name}:\n    def __init__(self):\n        ${}') },
  { label: 'try … except', type: 'keyword', detail: 'Error handling snippet', apply: snippet('try:\n    ${}\nexcept Exception as error:\n    print(error)') }
]);

const cSnippets = completeFromList([
  { label: 'main', type: 'function', detail: 'C program entry point', apply: snippet('int main(void) {\n    ${}\n    return 0;\n}') },
  { label: 'printf', type: 'function', detail: 'Print formatted output', apply: snippet('printf("${}");') },
  { label: 'scanf', type: 'function', detail: 'Read formatted input', apply: snippet('scanf("${}", &value);') },
  { label: 'for', type: 'keyword', detail: 'For loop', apply: snippet('for (int ${i} = 0; ${i} < ${count}; ${i}++) {\n    ${}\n}') },
  { label: 'if', type: 'keyword', detail: 'Conditional block', apply: snippet('if (${condition}) {\n    ${}\n}') },
  { label: 'while', type: 'keyword', detail: 'While loop', apply: snippet('while (${condition}) {\n    ${}\n}') },
  { label: '#include <stdio.h>', type: 'keyword', detail: 'Standard input/output header', apply: '#include <stdio.h>' },
  { label: 'size_t', type: 'type', detail: 'Unsigned size type' }
]);

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    minHeight: '100%',
    color: '#27324a',
    backgroundColor: '#fbfcff',
    fontSize: 'var(--editor-font-size, 12px)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--mono)',
    lineHeight: '1.75',
    overscrollBehavior: 'contain'
  },
  '.cm-content': { padding: 'var(--editor-content-padding, 19px 20px)', caretColor: '#6754dc' },
  '.cm-line': { padding: '0 2px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#6754dc' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(103, 84, 220, .16)' },
  '.cm-gutters': { borderRight: '1px solid #f0f1f6', backgroundColor: '#fbfcff', color: '#a5aaba' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: 'var(--editor-gutter-width, 42px)', paddingRight: 'var(--editor-gutter-pad, 12px)' },
  '.cm-activeLine': { backgroundColor: 'rgba(103, 84, 220, .035)', transition: 'background-color .12s ease' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(103, 84, 220, .04)' },
  '.cm-tooltip': {
    border: '1px solid #e1e3ed',
    borderRadius: '9px',
    backgroundColor: '#fff',
    boxShadow: '0 10px 26px rgba(33, 43, 73, .14)',
    animation: 'suggestion-in .14s ease-out both'
  },
  '.cm-tooltip-autocomplete ul': { maxHeight: '220px', fontFamily: 'var(--mono)' },
  '.cm-tooltip-autocomplete ul li': { padding: '5px 9px', borderRadius: '5px' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { color: '#20263a', backgroundColor: '#f0efff' },
  '.cm-completionDetail': { marginLeft: 'auto', paddingLeft: '10px', color: '#8d94a5', fontFamily: 'var(--sans)', fontSize: '10px' }
}, { dark: false });

export function createCodeEditor({ host, initialValue, language, onChange, onSelectionChange, onRun }) {
  const languageCompartment = new Compartment();
  const editorView = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: initialValue,
      extensions: [
        basicSetup,
        EditorState.tabSize.of(4),
        indentUnit.of('    '),
        languageCompartment.of(languageExtensions(language)),
        editorTheme,
        Prec.highest(keymap.of([
          indentWithTab,
          { key: 'Mod-Enter', run: () => { onRun(); return true; } }
        ])),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange();
          if (update.docChanged || update.selectionSet) onSelectionChange();
        })
      ]
    })
  });

  const editor = {
    get value() { return editorView.state.doc.toString(); },
    set value(value) {
      const text = String(value ?? '');
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: text },
        selection: { anchor: text.length }
      });
    },
    get selectionStart() { return editorView.state.selection.main.head; },
    get selectionEnd() { return editorView.state.selection.main.to; },
    setAttribute(name, value) { editorView.contentDOM.setAttribute(name, value); },
    focus() { editorView.focus(); }
  };

  return {
    editor,
    view: editorView,
    setLanguage(nextLanguage) {
      editorView.dispatch({ effects: languageCompartment.reconfigure(languageExtensions(nextLanguage)) });
    },
    showSuggestions() {
      editorView.focus();
      return startCompletion(editorView);
    }
  };
}

function languageExtensions(language) {
  if (language === 'c') {
    return [cpp(), cppLanguage.data.of({ autocomplete: cSnippets })];
  }
  return [python(), pythonLanguage.data.of({ autocomplete: pythonSnippets })];
}
