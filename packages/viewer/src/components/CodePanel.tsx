import { Highlight, themes, Prism } from 'prism-react-renderer';
import type { CodeSnippet, PRMetadata, DiffLine } from '../types';

// Register languages missing from prism-react-renderer's default bundle.
// Java extends clike (bundled) — covers keywords, annotations, generics, etc.
if (!Prism.languages.java) {
  Prism.languages.java = Prism.languages.extend('clike', {
    'class-name': [
      /\b[A-Z]\w*(?:\s*\.\s*[A-Z]\w*)*\b/,
      /\b[A-Z]\w*(?=\s+\w+\s*[;,=())])/,
    ],
    keyword: /\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|record|return|sealed|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|var|void|volatile|while|yield)\b/,
    number: /\b0b[01][01_]*L?\b|\b0x(?:[\da-f_]*\.)?[\da-f_p+-]+\b|(?:\b\d[\d_]*(?:\.[\d_]*)?|\B\.[\d_]+)(?:e[+-]?\d[\d_]*)?[dfl]?\b/i,
    operator: {
      pattern: /(^|[^.])(?:<<=?|>>>?=?|->|--|\+\+|&&|\|\||::|[?:~]|[-+*/%&|^!=<>]=?)/m,
      lookbehind: true,
    },
    annotation: {
      pattern: /@\w+(?:\.\w+)*/,
      alias: 'punctuation',
    },
  });
}

if (!Prism.languages.ruby) {
  Prism.languages.ruby = Prism.languages.extend('clike', {
    comment: { pattern: /#.*|^=begin\s[\s\S]*?^=end/m, greedy: true },
    'class-name': {
      pattern: /(\b(?:class|module)\s+|\bcatch\s+\()[\w.\\]+/i,
      lookbehind: true,
      inside: { punctuation: /[.\\]/ },
    },
    keyword: /\b(?:BEGIN|END|alias|and|begin|break|case|class|def|define_method|defined|do|each|else|elsif|end|ensure|extend|for|if|in|include|module|new|next|nil|not|or|prepend|private|protected|public|raise|redo|require|rescue|retry|return|self|send|super|then|throw|unless|until|when|while|yield)\b/,
    string: [
      { pattern: /"""[\s\S]*?"""|'''[\s\S]*?'''/, greedy: true },
      { pattern: /%[qQiIwWs]?\([^)]*\)/, greedy: true },
      { pattern: /("|')(?:#\{[^}]+\}|\\.|(?!\1)[^\\\r\n])*\1/, greedy: true },
    ],
    symbol: { pattern: /(^|[^:]):[\w_]+/, lookbehind: true },
    number: /\b(?:0[box][\da-f_]+|\d[\d_]*(?:\.[\d_]+)?(?:e[+-]?\d[\d_]+)?)\b/i,
    operator: /\.{2,3}|&\.|===|<=>|[!=]~|(?:&&|\|\||<<|>>|\*\*|[+\-*/%<>&|^!~])=?|[?:]/,
    punctuation: /[(){}[\];,]/,
  });
}

if (!Prism.languages.bash) {
  Prism.languages.bash = {
    comment: { pattern: /(^|[^\\])#.*/, lookbehind: true },
    'function': { pattern: /(^|[\s;|&])(?:alias|bg|bind|builtin|caller|cd|command|compgen|complete|declare|dirs|disown|echo|enable|eval|exec|exit|export|fc|fg|getopts|hash|help|history|jobs|kill|let|local|logout|mapfile|popd|printf|pushd|pwd|read|readarray|readonly|return|set|shift|shopt|source|suspend|test|times|trap|type|typeset|ulimit|umask|unalias|unset|wait)\b/, lookbehind: true, alias: 'builtin' },
    keyword: { pattern: /(^|[\s;|&])(?:if|then|else|elif|fi|for|while|until|do|done|in|case|esac|function|select)\b/, lookbehind: true },
    variable: /\$(?:\w+|[!#?*@$]|\{[^}]+\})/,
    string: [
      { pattern: /\$'(?:[^'\\]|\\.)*'/, greedy: true },
      { pattern: /("|')(?:\\[\s\S]|\$\([^)]+\)|\$(?!\()|`[^`]+`|(?!\1)[^\\`$])*\1/, greedy: true },
    ],
    number: { pattern: /(^|\s)(?:[1-9]\d*|0)(?:[.,]\d+)?\b/, lookbehind: true },
    operator: /&&|\|\||[!=<>]=?|[<>]|[-+*/%]=?|={1,2}/,
    punctuation: /\$?\(\(?|\)\)?|\.\.|[{}[\];\\]/,
  };
  Prism.languages.shell = Prism.languages.bash;
}

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
