import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import type { ReactNode } from 'react';

interface ExplanationPanelProps {
  explanation: string;
  style?: React.CSSProperties;
}

function parseCalloutTitle(children: ReactNode): { title: string | null; content: ReactNode } {
  if (!Array.isArray(children) && typeof children !== 'object') {
    return { title: null, content: children };
  }

  const childArray = Array.isArray(children) ? children : [children];

  // Check for [!type] syntax at the start
  const firstChild = childArray[0];
  if (typeof firstChild === 'string') {
    const match = firstChild.match(/^\[!(\w+)\]\s*/);
    if (match) {
      const title = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      const remainingText = firstChild.slice(match[0].length);
      return {
        title,
        content: remainingText ? [remainingText, ...childArray.slice(1)] : childArray.slice(1)
      };
    }
  }

  // Check for **Title:** pattern in first paragraph
  if (
    typeof firstChild === 'object' &&
    firstChild !== null &&
    'type' in firstChild &&
    firstChild.type === 'p'
  ) {
    const pChildren = (firstChild as { props?: { children?: ReactNode } }).props?.children;
    if (Array.isArray(pChildren)) {
      const firstPChild = pChildren[0];
      if (
        typeof firstPChild === 'object' &&
        firstPChild !== null &&
        'type' in firstPChild &&
        firstPChild.type === 'strong'
      ) {
        const strongText = (firstPChild as { props?: { children?: ReactNode } }).props?.children;
        if (typeof strongText === 'string' && strongText.endsWith(':')) {
          return {
            title: strongText.slice(0, -1),
            content: childArray
          };
        }
      }
    }
  }

  return { title: null, content: children };
}

const markdownComponents: Components = {
  blockquote: ({ children }) => {
    const { title, content } = parseCalloutTitle(children);

    return (
      <div className="callout">
        {title && <div className="callout-title">{title}</div>}
        {content}
      </div>
    );
  }
};

export function ExplanationPanel({ explanation, style }: ExplanationPanelProps) {
  return (
    <div className="explanation-panel" style={style}>
      <ReactMarkdown components={markdownComponents}>{explanation}</ReactMarkdown>
    </div>
  );
}
