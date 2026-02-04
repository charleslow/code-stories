import ReactMarkdown from 'react-markdown';

interface ExplanationPanelProps {
  explanation: string;
}

export function ExplanationPanel({ explanation }: ExplanationPanelProps) {
  return (
    <div className="explanation-panel">
      <ReactMarkdown>{explanation}</ReactMarkdown>
    </div>
  );
}
