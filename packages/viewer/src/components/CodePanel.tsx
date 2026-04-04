import { Highlight, themes } from 'prism-react-renderer';
import type { CodeSnippet, PRMetadata, DiffLine } from '../types';

// Register Java, Ruby, and Bash grammars missing from prism-react-renderer's
// default bundle. The setup module exposes the Prism instance globally so the
// prismjs IIFE grammar files attach to the right object.
import '../prism-setup';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-bash';

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

function DiffSnippetView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="diff-pre">
      {lines.map((line, i) => {
        const typeClass = `diff-line diff-line-${line.type}`;
        const marker = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
        return (
          <div key={i} className={typeClass}>
            <span className="diff-gutter diff-gutter-old">
              {line.oldLineNumber ?? ''}
            </span>
            <span className="diff-gutter diff-gutter-new">
              {line.newLineNumber ?? ''}
            </span>
            <span className="diff-marker">{marker}</span>
            <span className="diff-content">{line.content}</span>
          </div>
        );
      })}
    </div>
  );
}

function getDiffChangeCount(lines: DiffLine[]): string {
  const added = lines.filter(l => l.type === 'added').length;
  const removed = lines.filter(l => l.type === 'removed').length;
  const parts = [];
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`-${removed}`);
  return parts.join(' ') || '0 changes';
}

interface CodePanelProps {
  snippets: CodeSnippet[];
  style?: React.CSSProperties;
  storyQuery?: string;
  storyRepo?: string | null;
  storyPR?: PRMetadata;
}

export function CodePanel({ snippets, style, storyQuery, storyRepo, storyPR }: CodePanelProps) {
  if (snippets.length === 0) {
    const hasMetadata = storyQuery || storyRepo || storyPR;
    return (
      <div className="code-panel empty" style={style}>
        {storyPR ? (
          <div className="pr-metadata">
            <div>
              <span className="pr-number">#{storyPR.number}</span>
              <span className="pr-title">{storyPR.title}</span>
            </div>
            <div className="pr-branch-info">
              {storyPR.baseBranch} ← {storyPR.headBranch}
            </div>
            <div className="metadata-label">Author</div>
            <div className="metadata-value">{storyPR.author}</div>
            {storyPR.labels.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                {storyPR.labels.map((label) => (
                  <span key={label} className="pr-label">{label}</span>
                ))}
              </div>
            )}
            {storyQuery && (
              <>
                <div className="metadata-label" style={{ marginTop: '1.25rem' }}>Query</div>
                <div className="metadata-value metadata-query">{storyQuery}</div>
              </>
            )}
          </div>
        ) : hasMetadata ? (
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
      {snippets.map((snippet, index) => {
        const isDiff = snippet.type === 'diff' && snippet.lines;
        return (
          <div key={index} className="snippet">
            <div className="snippet-header">
              <span className="file-path">
                {snippet.filePath}
                {isDiff && <span className="diff-badge">DIFF</span>}
              </span>
              <span className="line-range">
                {isDiff
                  ? getDiffChangeCount(snippet.lines!)
                  : `L${snippet.startLine}\u2013${snippet.endLine}`
                }
              </span>
            </div>
            {isDiff ? (
              <DiffSnippetView lines={snippet.lines!} />
            ) : (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
