import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Shared middleware for serving local stories (works in both dev and preview)
function localStoriesMiddleware(req: any, res: any, next: any) {
  const storiesDir = path.resolve(__dirname, '../../stories')

  // Discovery endpoint: list all stories
  if (req.url === '/_discover') {
    try {
      const files = fs.readdirSync(storiesDir).filter((f: string) => f.endsWith('.json') && f !== 'manifest.json')
      const stories = files.map((f: string) => {
        try {
          const filePath = path.join(storiesDir, f)
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          const mtime = fs.statSync(filePath).mtimeMs
          return {
            id: data.id || f.replace('.json', ''),
            title: data.title || f.replace('.json', ''),
            createdAt: data.createdAt || null,
            url: `local-stories/${f}`,
            mtime,
          }
        } catch { return null }
      }).filter(Boolean)
      // Sort by file modification time, most recent first
      stories.sort((a: any, b: any) => b.mtime - a.mtime)
      // Remove mtime before sending to client
      stories.forEach((s: any) => delete s.mtime)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(stories))
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
}

// https://vite.dev/config/
export default defineConfig({
  base: './',  // Relative paths — Tailscale Serve strips the /code-stories prefix
  server: {
    host: '127.0.0.1',
    allowedHosts: true,
  },
  preview: {
    host: '127.0.0.1',
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
