import { useState } from 'react';
import type { RecentStory } from '../services/api';

interface LandingPageProps {
  recentStories: RecentStory[];
  onLoadStory: (url: string) => void;
}

export function LandingPage({ recentStories, onLoadStory }: LandingPageProps) {
  const [urlInput, setUrlInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (trimmed) {
      // Handle different input formats
      let url = trimmed;

      // Convert GitHub blob URLs to raw URLs
      const blobMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/);
      if (blobMatch) {
        url = `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}`;
      }
      // If it looks like a GitHub shorthand (user/repo/story-id or user/repo:story-id)
      else {
        const shorthandMatch = trimmed.match(/^([^\/]+\/[^\/]+)[\/:]([a-f0-9-]+)$/i);
        if (shorthandMatch) {
          const [, repo, storyId] = shorthandMatch;
          url = `https://raw.githubusercontent.com/${repo}/main/stories/${storyId}.json`;
        }
      }

      onLoadStory(url);
    }
  };

  return (
    <div className="landing-page">
      <h1>Code Stories</h1>
      <p className="tagline">View narrative-driven code stories from any source</p>

      <form onSubmit={handleSubmit} className="url-form">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Enter a story URL or GitHub path (e.g., user/repo/story-id)"
        />
        <button type="submit" disabled={!urlInput.trim()}>
          Load Story
        </button>
      </form>

      <div className="format-hints">
        <h3>Supported formats:</h3>
        <ul>
          <li><code>{'https://github.com/<user>/<repo>/blob/<branch>/<folder>/<story>.json'}</code></li>
          <li><code>{'https://raw.githubusercontent.com/<user>/<repo>/<branch>/<folder>/<story>.json'}</code></li>
          <li><code>{'<user>/<repo>/<story-id>'}</code> - GitHub shorthand (main branch, stories/ folder)</li>
        </ul>
      </div>

      {recentStories.length > 0 && (
        <div className="recent-stories">
          <h2>Recent Stories</h2>
          <ul>
            {recentStories.map((story) => (
              <li key={story.url}>
                <button onClick={() => onLoadStory(story.url)}>
                  <span className="story-title">{story.title}</span>
                  <span className="story-meta">
                    {new Date(story.accessedAt).toLocaleDateString()}
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
