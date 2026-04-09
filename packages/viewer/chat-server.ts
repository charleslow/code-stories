import path from 'path'
import fsPromises from 'fs/promises'
import { spawn } from 'child_process'
import type { Connect } from 'vite'
import type { ServerResponse } from 'http'
import { isSafeId, readBody, buildChatPrompt, withFileLock } from './chat-utils'

const storiesDir = path.resolve(__dirname, '../../stories')

function jsonResponse(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

export function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (err: Error | null, result?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(result!)
    }

    // Strip CLAUDECODE env vars so nested codex sessions don't fail
    const cleanEnv = { ...process.env }
    delete cleanEnv.CLAUDECODE
    delete cleanEnv.CLAUDE_CODE_ENTRYPOINT
    delete cleanEnv.CLAUDE_CODE_SESSION

    const proc = spawn('codex', ['-p', '--allowedTools', 'Read', '--add-dir', storiesDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
    })
    console.log('[chat] codex process pid:', proc.pid)

    const maxBuffer = 1024 * 1024
    let stdout = ''
    let stderr = ''

    // Timeout after 120 seconds
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      done(new Error('Codex timed out after 120 seconds'))
    }, 120000)

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
      if (stdout.length > maxBuffer) {
        proc.kill('SIGTERM')
        done(new Error('Codex output exceeded max buffer size'))
      }
    })

    proc.stderr.on('data', (data: Buffer) => {
      if (stderr.length < maxBuffer) stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('[chat] codex responded, length:', stdout.length)
        done(null, stdout.trim())
      } else {
        console.error('[chat] codex spawn error:', { code, stderr })
        done(new Error(stderr || `Codex exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      console.error('[chat] codex spawn error:', err.message)
      done(new Error(err.message))
    })

    // Send prompt via stdin (avoids argument length limits and thinking-state hangs)
    proc.stdin.on('error', (err) => {
      console.error('[chat] stdin write error:', err.message)
      /* process died before prompt was fully written; close handler will settle */
    })
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

// Limit concurrent Codex processes
let activeChatRequests = 0
const MAX_CONCURRENT_CHATS = 2

async function readChatFile(chatPath: string, storyId: string) {
  try {
    return JSON.parse(await fsPromises.readFile(chatPath, 'utf-8'))
  } catch {
    return { storyId, chapters: {} }
  }
}

// Cache for resolveStoryFilename to avoid repeated directory scans
const storyFilenameCache = new Map<string, { filename: string; timestamp: number }>()
const CACHE_TTL_MS = 30_000 // 30 seconds

/**
 * Resolve a storyId to its actual filename on disk.
 */
async function resolveStoryFilename(storyId: string): Promise<string> {
  // Check cache first
  const cached = storyFilenameCache.get(storyId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.filename
  }

  const directPath = path.join(storiesDir, `${storyId}.json`)
  try {
    await fsPromises.access(directPath)
    storyFilenameCache.set(storyId, { filename: storyId, timestamp: Date.now() })
    return storyId
  } catch {
    // File not found by name — scan for matching internal id
  }

  const allFiles = await fsPromises.readdir(storiesDir)
  const storyFiles = allFiles.filter(f => f.endsWith('.json') && f !== 'manifest.json' && !f.endsWith('.chat.json'))

  for (const f of storyFiles) {
    try {
      const data = JSON.parse(await fsPromises.readFile(path.join(storiesDir, f), 'utf-8'))
      if (data.id === storyId) {
        const filename = f.replace(/\.json$/, '')
        storyFilenameCache.set(storyId, { filename, timestamp: Date.now() })
        return filename
      }
    } catch {
      // Skip unreadable files
    }
  }

  throw new Error(`Story not found: ${storyId}`)
}

async function readStoryFile(storyId: string) {
  const filename = await resolveStoryFilename(storyId)
  const storyPath = path.join(storiesDir, `${filename}.json`)
  const data = JSON.parse(await fsPromises.readFile(storyPath, 'utf-8'))
  return { filename, data: data as {
    title: string
    repo?: string | null
    chapters: {
      id: string
      label: string
      snippets: { filePath: string; content: string; type?: 'code' | 'diff'; lines?: { type: 'added' | 'removed' | 'context'; content: string }[] }[]
      explanation: string
    }[]
  }}
}

export async function handleChatRequest(req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
  // Chat availability check
  if (req.url === '/_chat/available') {
    return jsonResponse(res, { available: true })
  }

  // Chat history: GET /_chat/:storyId
  const chatGetMatch = req.url?.match(/^\/_chat\/([^/]+)$/)
  if (chatGetMatch && req.method === 'GET') {
    const storyId = decodeURIComponent(chatGetMatch[1])
    if (!isSafeId(storyId)) {
      return jsonResponse(res, { error: 'Invalid story ID' }, 400)
    }
    let filename: string
    try {
      filename = await resolveStoryFilename(storyId)
    } catch {
      return jsonResponse(res, { error: 'Story not found' }, 404)
    }
    const chatPath = path.join(storiesDir, `${filename}.chat.json`)
    const chatData = await readChatFile(chatPath, storyId)
    return jsonResponse(res, chatData)
  }

  // Chat send: POST /_chat/:storyId/:chapterId
  const chatPostMatch = req.url?.match(/^\/_chat\/([^/]+)\/([^/]+)$/)
  if (chatPostMatch && req.method === 'POST') {
    const storyId = decodeURIComponent(chatPostMatch[1])
    const chapterId = decodeURIComponent(chatPostMatch[2])
    if (!isSafeId(storyId) || !isSafeId(chapterId)) {
      return jsonResponse(res, { error: 'Invalid story or chapter ID' }, 400)
    }

    if (activeChatRequests >= MAX_CONCURRENT_CHATS) {
      return jsonResponse(res, { error: 'Too many concurrent chat requests. Please wait.' }, 429)
    }

    activeChatRequests++
    try {
      let body: { message?: unknown }
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        return jsonResponse(res, { error: 'Malformed JSON request body' }, 400)
      }
      if (!body.message || typeof body.message !== 'string' || body.message.length > 10000) {
        return jsonResponse(res, { error: 'Invalid or too-long message' }, 400)
      }

      const { filename, data: story } = await readStoryFile(storyId)
      const chatPath = path.join(storiesDir, `${filename}.chat.json`)
      const chapterIdx = story.chapters.findIndex(c => c.id === chapterId)
      if (chapterIdx === -1) {
        return jsonResponse(res, { error: 'Chapter not found' }, 404)
      }

      const currentChapter = story.chapters[chapterIdx]
      const prevChapter = chapterIdx > 0
        ? { label: story.chapters[chapterIdx - 1].label, explanation: story.chapters[chapterIdx - 1].explanation }
        : null
      const nextChapter = chapterIdx < story.chapters.length - 1
        ? { label: story.chapters[chapterIdx + 1].label, explanation: story.chapters[chapterIdx + 1].explanation }
        : null

      // Include overview (first chapter) if it's not already current, prev, or next
      const firstChapter = story.chapters[0]
      const overviewChapter = chapterIdx > 1
        ? { label: firstChapter.label, explanation: firstChapter.explanation }
        : null

      // Read history and build prompt BEFORE acquiring the lock
      const chatDataForPrompt = await readChatFile(chatPath, storyId)
      const history = chatDataForPrompt.chapters[chapterId] || []

      const storyFile = path.join(storiesDir, `${filename}.json`)

      const prompt = buildChatPrompt({
        message: body.message,
        title: story.title,
        repo: story.repo,
        currentChapter,
        prevChapter,
        nextChapter,
        overviewChapter,
        totalChapters: story.chapters.length,
        history,
        storyFile,
      })

      // Run Codex OUTSIDE the lock — this is the slow part (up to 120s)
      const aiReply = await runClaude(prompt)

      // Only lock for the atomic read-modify-write of the chat file
      await withFileLock(chatPath, async () => {
        const chatData = await readChatFile(chatPath, storyId)
        const now = new Date().toISOString()
        if (!chatData.chapters[chapterId]) {
          chatData.chapters[chapterId] = []
        }
        chatData.chapters[chapterId].push(
          { role: 'user', content: body.message, timestamp: now },
          { role: 'assistant', content: aiReply, timestamp: now }
        )

        // Atomic write
        const tmpPath = chatPath + '.tmp'
        await fsPromises.writeFile(tmpPath, JSON.stringify(chatData, null, 2))
        await fsPromises.rename(tmpPath, chatPath)
      })

      return jsonResponse(res, { reply: aiReply })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chat failed'
      return jsonResponse(res, { error: message }, 500)
    } finally {
      activeChatRequests--
    }
  }

  next()
}

export { storiesDir }
