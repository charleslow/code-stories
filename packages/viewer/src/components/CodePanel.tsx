import { Highlight, themes } from 'prism-react-renderer';
import type { CodeSnippet } from '../types';

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.html': 'markup',
  '.xml': 'markup',
  '.svg': 'markup',
  '.makefile': 'makefile',
  '.diff': 'diff',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.coffee': 'coffeescript',
  '.ml': 'ocaml',
  '.mli': 'ocaml',
  '.re': 'reason',
  '.wasm': 'wasm',
};

function getLanguage(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) {
    const base = filePath.split('/').pop() ?? '';
    if (base === 'Makefile' || base === 'makefile') return 'makefile';
    if (base === 'Dockerfile') return 'bash';
    return 'python';
  }
  return EXT_TO_LANGUAGE[filePath.slice(dot)] ?? 'python';
}

interface CodePanelProps {
  snippets: CodeSnippet[];
  style?: React.CSSProperties;
}

export function CodePanel({ snippets, style }: CodePanelProps) {
  if (snippets.length === 0) {
    return (
      <div className="code-panel empty" style={style}>
        <p className="no-code">This chapter contains no code snippets.</p>
      </div>
    );
  }

  return (
    <div className="code-panel" style={style}>
      {snippets.map((snippet, index) => (
        <div key={index} className="snippet">
          <div className="snippet-header">
            <span className="file-path">{snippet.filePath}</span>
            <span className="line-range">
              L{snippet.startLine}–{snippet.endLine}
            </span>
          </div>
          <Highlight
            theme={themes.oneDark}
            code={snippet.content}
            language={getLanguage(snippet.filePath)}
          >
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre className={className} style={style}>
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    <span className="line-number">
                      {snippet.startLine + i}
                    </span>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </div>
      ))}
    </div>
  );
}
