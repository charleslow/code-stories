import { useState } from 'react';
import type { StoryMetadata } from '../types';

interface QueryInputProps {
  stories: StoryMetadata[];
  onGenerate: (query: string) => void;
  onSelectStory: (id: string) => void;
}

export function QueryInput({ stories, onGenerate, onSelectStory }: QueryInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onGenerate(query.trim());
    }
  };

  return (
    <div className="query-input">
      <h1>Code Stories</h1>
      <p className="tagline">Understand code through narrative-driven stories</p>

      <form onSubmit={handleSubmit} className="query-form">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question about the codebase...&#10;&#10;Examples:&#10;• How does the authentication flow work?&#10;• Trace a request from API to database&#10;• How are errors handled?"
          rows={5}
        />
        <button type="submit" disabled={!query.trim()}>
          Generate Story
        </button>
      </form>

      {stories.length > 0 && (
        <div className="previous-stories">
          <h2>Previous Stories</h2>
          <ul>
            {stories.map((story) => (
              <li key={story.id}>
                <button onClick={() => onSelectStory(story.id)}>
                  <span className="story-title">{story.title}</span>
                  <span className="story-meta">
                    {new Date(story.createdAt).toLocaleDateString()} •{' '}
                    {story.commitHash.slice(0, 7)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
