import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  base: '/code-stories/',  // Subpath for GitHub Pages at charleslow.github.io/code-stories/
  plugins: [
    react(),
    // Serve local stories in dev mode at /local-stories/
    {
      name: 'serve-local-stories',
      configureServer(server) {
        server.middlewares.use('/local-stories', (req, res, next) => {
          const storiesDir = path.resolve(__dirname, '../../stories')

          // Discovery endpoint: list all stories
          if (req.url === '/_discover') {
            try {
              const files = fs.readdirSync(storiesDir).filter(f => f.endsWith('.json') && f !== 'manifest.json')
              const stories = files.map(f => {
                try {
                  const data = JSON.parse(fs.readFileSync(path.join(storiesDir, f), 'utf-8'))
                  return {
                    id: data.id || f.replace('.json', ''),
                    title: data.title || f.replace('.json', ''),
                    createdAt: data.createdAt || null,
                    url: `/local-stories/${f}`,
                  }
                } catch { return null }
              }).filter(Boolean)
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
        })
      }
    }
  ],
})
