import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const sampleStoriesDir = path.resolve(__dirname, '../../sample_stories')
const fixturesDir = path.resolve(__dirname, 'tests/fixtures')

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5174,
    allowedHosts: true,
  },
  plugins: [
    react(),
    {
      name: 'mock-local-stories',
      configureServer(server) {
        server.middlewares.use('/local-stories', (req, res, next) => {
          // Chat availability
          if (req.url === '/_chat/available') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ available: true }))
            return
          }

          // Chat history: GET /_chat/:storyId
          const chatMatch = req.url?.match(/^\/_chat\/([^/]+)$/)
          if (chatMatch && req.method === 'GET') {
            const storyId = decodeURIComponent(chatMatch[1])
            // Look for a matching fixture file by story ID
            const fixturePath = path.join(fixturesDir, `${storyId}.chat.json`)
            // Also try matching by filename from sample_stories
            let chatData = { storyId, chapters: {} }
            if (fs.existsSync(fixturePath)) {
              chatData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'))
            } else {
              // Try to find by scanning sample_stories for matching id
              const files = fs.readdirSync(sampleStoriesDir).filter(f => f.endsWith('.json') && !f.endsWith('.chat.json') && f !== 'manifest.json')
              for (const file of files) {
                try {
                  const story = JSON.parse(fs.readFileSync(path.join(sampleStoriesDir, file), 'utf-8'))
                  if (story.id === storyId) {
                    const chatFixture = path.join(fixturesDir, file.replace('.json', '.chat.json'))
                    if (fs.existsSync(chatFixture)) {
                      chatData = JSON.parse(fs.readFileSync(chatFixture, 'utf-8'))
                    }
                    break
                  }
                } catch { /* skip */ }
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(chatData))
            return
          }

          // Serve story JSON files from sample_stories
          const filePath = path.join(sampleStoriesDir, req.url || '')
          if (!filePath.startsWith(sampleStoriesDir) || !filePath.endsWith('.json')) {
            return next()
          }
          if (fs.existsSync(filePath)) {
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(fs.readFileSync(filePath, 'utf-8'))
          } else {
            next()
          }
        })
      },
    },
  ],
})
