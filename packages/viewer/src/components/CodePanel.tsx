import { Highlight, themes } from 'prism-react-renderer';
import type { CodeSnippet } from '../types';

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.py': 'python', '.js': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
  '.jsx': 'jsx', '.rs': 'rust', '.go': 'go', '.java': 'java',
  '.cpp': 'cpp', '.cc': 'cpp', '.h': 'cpp', '.c': 'c',
  '.rb': 'ruby', '.sh': 'bash', '.css': 'css', '.html': 'markup',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown', '.sql': 'sql',
};

function getLanguageFromPath(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return 'typescript';
  return EXT_TO_LANGUAGE[filePath.slice(dot)] ?? 'typescript';
}

interface CodePanelProps {
  snippets: CodeSnippet[];
  style?: React.CSSProperties;
  storyQuery?: string;
  storyRepo?: string | null;
}

export function CodePanel({ snippets, style, storyQuery, storyRepo }: CodePanelProps) {
  if (snippets.length === 0) {
    const hasMetadata = storyQuery || storyRepo;
    return (
      <div className="code-panel empty" style={style}>
        {hasMetadata ? (
          <div className="story-metadata">
            <div className="metadata-label">Repository</div>
            <div className="metadata-value metadata-repo">
              {storyRepo || 'Local repository'}
            </div>
            <div className="metadata-label">Query</div>
            <div className="metadata-value metadata-query">{storyQuery}</div>
          </div>
        ) : (
          <p className="no-code">This chapter contains no code snippets.</p>
        )}
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
            language={getLanguageFromPath(snippet.filePath)}
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
