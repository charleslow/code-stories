import { Highlight, themes } from 'prism-react-renderer';
import type { CodeSnippet } from '../types';

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
            language="python"
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
