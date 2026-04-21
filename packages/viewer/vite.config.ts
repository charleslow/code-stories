import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import type { Connect } from 'vite'
import type { ServerResponse } from 'http'
import { handleChatRequest, storiesDir } from './chat-server'

interface LocalStoryEntry {
  id: string
  title: string
  createdAt: string | null
  url: string
  mtime: number
}

// Shared middleware for serving local stories (works in both dev and preview)
function localStoriesMiddleware(req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
  // Try chat endpoints first
  handleChatRequest(req, res, () => {
    // Discovery endpoint: list all stories
    if (req.url === '/_discover') {
      try {
        const files = fs.readdirSync(storiesDir).filter((f: string) => f.endsWith('.json') && f !== 'manifest.json' && !f.endsWith('.chat.json'))
        const stories = files.map((f: string): LocalStoryEntry | null => {
          try {
            const filePath = path.join(storiesDir, f)
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { id?: string; title?: string; createdAt?: string | null }
            const mtime = fs.statSync(filePath).mtimeMs
            return {
              id: data.id || f.replace('.json', ''),
              title: data.title || f.replace('.json', ''),
              createdAt: data.createdAt || null,
              url: `local-stories/${f}`,
              mtime,
            }
          } catch { return null }
        }).filter((story): story is LocalStoryEntry => story !== null)
        // Sort by file modification time, most recent first
        stories.sort((a, b) => b.mtime - a.mtime)
        // Remove mtime before sending to client
        const responseStories = stories.map((story) => ({
          id: story.id,
          title: story.title,
          createdAt: story.createdAt,
          url: story.url,
        }))
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(responseStories))
      } catch {
        res.setHeader('Content-Type', 'application/json')
        res.end('[]')
      }
      return
    }

    const filePath = path.join(storiesDir, req.url || '')

    // Security: ensure we're still within stories dir and it's a JSON file
    if (!filePath.startsWith(storiesDir) || !filePath.endsWith('.json')) {
      return next()
    }

    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(fs.readFileSync(filePath, 'utf-8'))
    } else {
      next()
    }
  }).catch(next)
}

// https://vite.dev/config/
export default defineConfig({
  base: './',  // Relative paths — Tailscale Serve strips the /code-stories prefix
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  plugins: [
    react(),
    {
      name: 'serve-local-stories',
      configureServer(server) {
        server.middlewares.use('/local-stories', localStoriesMiddleware)
      },
      configurePreviewServer(server) {
        server.middlewares.use('/local-stories', localStoriesMiddleware)
      },
    }
  ],
})
