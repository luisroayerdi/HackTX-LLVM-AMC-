import './App.css';
import { useState, useRef } from 'react';

function App() {
  const [selectedModel, setSelectedModel] = useState('Cortex-A Family pipeline');
  const [code, setCode] = useState(`#include <iostream>
using namespace std;

int main() {
    cout << "Hello World!";
    return 0;
}`);
  const [output, setOutput] = useState('');
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);

  const handleRun = () => {
    setOutput('Code execution simulated.\nOutput: Hello World!');
  };

  const handleScroll = (e) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.target.scrollTop;
      highlightRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  const handleKeyDown = (e) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;
    
    // Auto-closing pairs
    const pairs = {
      '(': ')',
      '{': '}',
      '[': ']',
      '"': '"',
      "'": "'"
    };

    const closingChars = [')', '}', ']', '"', "'"];

    // Skip over closing bracket if it's already there
    if (closingChars.includes(e.key) && selectionStart === selectionEnd) {
      const nextChar = value[selectionStart];
      if (nextChar === e.key) {
        e.preventDefault();
        // Just move cursor forward
        setTimeout(() => {
          textarea.selectionStart = selectionStart + 1;
          textarea.selectionEnd = selectionStart + 1;
        }, 0);
        return;
      }
    }

    // Handle auto-closing
    if (pairs[e.key] && selectionStart === selectionEnd) {
      e.preventDefault();
      const before = value.substring(0, selectionStart);
      const after = value.substring(selectionEnd);
      const newValue = before + e.key + pairs[e.key] + after;
      
      setCode(newValue);
      
      // Set cursor position between the pair
      setTimeout(() => {
        textarea.selectionStart = selectionStart + 1;
        textarea.selectionEnd = selectionStart + 1;
      }, 0);
    }
    // Handle Tab key for indentation
    else if (e.key === 'Tab') {
      e.preventDefault();
      const before = value.substring(0, selectionStart);
      const after = value.substring(selectionEnd);
      const newValue = before + '    ' + after;
      
      setCode(newValue);
      
      // Set cursor position after the tab
      setTimeout(() => {
        textarea.selectionStart = selectionStart + 4;
        textarea.selectionEnd = selectionStart + 4;
      }, 0);
    }
    // Handle Enter key for auto-indentation
    else if (e.key === 'Enter') {
      e.preventDefault();
      
      // Find the current line
      const before = value.substring(0, selectionStart);
      const after = value.substring(selectionStart);
      const currentLineStart = before.lastIndexOf('\n') + 1;
      const currentLine = before.substring(currentLineStart);
      
      // Get the indentation of current line (leading spaces/tabs)
      const indentMatch = currentLine.match(/^[\s]*/);
      let indent = indentMatch ? indentMatch[0] : '';
      
      // Check if cursor is between {} or [] or ()
      const charBefore = before[selectionStart - 1];
      const charAfter = after[0];
      const isBetweenBraces = 
        (charBefore === '{' && charAfter === '}') ||
        (charBefore === '[' && charAfter === ']') ||
        (charBefore === '(' && charAfter === ')');
      
      if (isBetweenBraces) {
        // Add newline with extra indentation, then newline with current indentation
        const extraIndent = indent + '    ';
        const newValue = before + '\n' + extraIndent + '\n' + indent + after;
        setCode(newValue);
        
        // Set cursor position at the indented line
        setTimeout(() => {
          const newPosition = selectionStart + 1 + extraIndent.length;
          textarea.selectionStart = newPosition;
          textarea.selectionEnd = newPosition;
        }, 0);
      } else {
        // Normal enter behavior
        const trimmedLine = currentLine.trim();
        if (trimmedLine.endsWith('{')) {
          indent += '    ';
        }
        
        const newValue = before + '\n' + indent + after;
        setCode(newValue);
        
        // Set cursor position after the indentation
        setTimeout(() => {
          const newPosition = selectionStart + 1 + indent.length;
          textarea.selectionStart = newPosition;
          textarea.selectionEnd = newPosition;
        }, 0);
      }
    }
  };

  const syntaxHighlight = (code) => {
    // Escape HTML to prevent injection
    const escapeHtml = (text) => {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, m => map[m]);
    };

    // Split code into tokens
    const tokens = [];
    let i = 0;
    
    while (i < code.length) {
      let matched = false;
      
      // Multi-line comments
      if (code.substr(i, 2) === '/*') {
        let end = code.indexOf('*/', i + 2);
        if (end === -1) end = code.length;
        else end += 2;
        tokens.push({ type: 'comment', value: code.substring(i, end) });
        i = end;
        matched = true;
      }
      // Single-line comments
      else if (code.substr(i, 2) === '//') {
        let end = code.indexOf('\n', i);
        if (end === -1) end = code.length;
        else end += 1;
        tokens.push({ type: 'comment', value: code.substring(i, end) });
        i = end;
        matched = true;
      }
      // Include file names with angle brackets
      else if (code[i] === '<' && i > 0 && code.substring(Math.max(0, i - 10), i).includes('#include')) {
        let end = code.indexOf('>', i);
        if (end !== -1) {
          tokens.push({ type: 'string', value: code.substring(i, end + 1) });
          i = end + 1;
          matched = true;
        }
      }
      // Strings with double quotes
      else if (code[i] === '"') {
        let end = i + 1;
        while (end < code.length && (code[end] !== '"' || code[end - 1] === '\\')) {
          end++;
        }
        tokens.push({ type: 'string', value: code.substring(i, end + 1) });
        i = end + 1;
        matched = true;
      }
      // Strings with single quotes
      else if (code[i] === "'") {
        let end = i + 1;
        while (end < code.length && (code[end] !== "'" || code[end - 1] === '\\')) {
          end++;
        }
        tokens.push({ type: 'string', value: code.substring(i, end + 1) });
        i = end + 1;
        matched = true;
      }
      // Preprocessor directives
      else if (code[i] === '#') {
        let end = i + 1;
        while (end < code.length && /[a-zA-Z_]/.test(code[end])) {
          end++;
        }
        tokens.push({ type: 'preprocessor', value: code.substring(i, end) });
        i = end;
        matched = true;
      }
      // Numbers
      else if (/\d/.test(code[i])) {
        let end = i;
        while (end < code.length && /[\d.]/.test(code[end])) {
          end++;
        }
        tokens.push({ type: 'number', value: code.substring(i, end) });
        i = end;
        matched = true;
      }
      // Identifiers and keywords
      else if (/[a-zA-Z_]/.test(code[i])) {
        let end = i;
        while (end < code.length && /[a-zA-Z0-9_]/.test(code[end])) {
          end++;
        }
        const word = code.substring(i, end);
        const keywords = ['int', 'float', 'double', 'char', 'void', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'const', 'static', 'extern', 'typedef', 'struct', 'class', 'public', 'private', 'protected', 'virtual', 'new', 'delete', 'namespace', 'using', 'include', 'bool', 'true', 'false', 'nullptr', 'auto', 'long', 'short', 'unsigned', 'signed'];
        
        // Check if next non-space character is '(' to identify functions
        let nextIdx = end;
        while (nextIdx < code.length && /\s/.test(code[nextIdx])) nextIdx++;
        
        if (keywords.includes(word)) {
          tokens.push({ type: 'keyword', value: word });
        } else if (code[nextIdx] === '(') {
          tokens.push({ type: 'function', value: word });
        } else {
          tokens.push({ type: 'identifier', value: word });
        }
        i = end;
        matched = true;
      }
      // Operators
      else if ('+-*/%=<>!&|^~?:;,(){}[]'.includes(code[i])) {
        // Check for two-character operators
        const twoChar = code.substr(i, 2);
        if (['<<', '>>', '&&', '||', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '::'].includes(twoChar)) {
          tokens.push({ type: 'operator', value: twoChar });
          i += 2;
        } else {
          tokens.push({ type: 'operator', value: code[i] });
          i++;
        }
        matched = true;
      }
      
      if (!matched) {
        tokens.push({ type: 'text', value: code[i] });
        i++;
      }
    }
    
    // Convert tokens to HTML
    return tokens.map(token => {
      const escaped = escapeHtml(token.value);
      switch (token.type) {
        case 'keyword':
          return `<span class="keyword">${escaped}</span>`;
        case 'preprocessor':
          return `<span class="preprocessor">${escaped}</span>`;
        case 'string':
          return `<span class="string">${escaped}</span>`;
        case 'comment':
          return `<span class="comment">${escaped}</span>`;
        case 'number':
          return `<span class="number">${escaped}</span>`;
        case 'function':
          return `<span class="function">${escaped}</span>`;
        case 'operator':
          return `<span class="operator">${escaped}</span>`;
        case 'identifier':
          return `<span class="identifier">${escaped}</span>`;
        default:
          return escaped;
      }
    }).join('');
  };

  const lineNumbers = code.split('\n').length;

  return (
    <div className="App">
      <div className="container">
        <div className="header">
          <select 
            className="model-selector"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option value="Cortex-A Family pipeline">Cortex-A Family pipeline</option>
            <option value="Ethos NPU">Ethos NPU</option>
          </select>
          <button className="run-button" onClick={handleRun}>
            ▶ Run
          </button>
        </div>
        
        <div className="main-content">
          <div className="editor-section">
            <div className="code-editor-header">
              <span className="code-icon">&lt;/&gt;</span>
              <span className="language-label">C++</span>
            </div>
            <div className="editor-container">
              <div className="line-numbers">
                {Array.from({ length: lineNumbers }, (_, i) => (
                  <div key={i + 1} className="line-number">{i + 1}</div>
                ))}
              </div>
              <div className="code-wrapper">
                <div 
                  ref={highlightRef}
                  className="syntax-highlight"
                  dangerouslySetInnerHTML={{ __html: syntaxHighlight(code) }}
                />
                <textarea
                  ref={textareaRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onScroll={handleScroll}
                  onKeyDown={handleKeyDown}
                  className="code-textarea"
                  spellCheck="false"
                />
              </div>
            </div>
          </div>
          
          <div className="output-section">
            <div className="output-header">Output</div>
            <pre className="output-content">{output || 'Output will appear here...'}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
