import type { Connect } from 'vite'

// Only allow safe characters in IDs — no path traversal possible
const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

export function isSafeId(id: string): boolean {
  return SAFE_ID_RE.test(id) && !id.includes('..')
}

export const MAX_BODY_SIZE = 512 * 1024 // 512KB limit for request bodies

export function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_SIZE) {
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

// Truncate history to the last N messages to avoid blowing past context limits
const MAX_HISTORY_MESSAGES = 20

export interface ChatSnippet {
  filePath: string
  content: string
  type?: 'code' | 'diff'
  lines?: { type: 'added' | 'removed' | 'context'; content: string }[]
}

export interface ChatChapter {
  label: string
  snippets: ChatSnippet[]
  explanation: string
}

export interface BuildChatPromptInput {
  message: string
  title: string
  repo: string | null | undefined
  currentChapter: ChatChapter
  prevChapter: { label: string; explanation: string } | null
  nextChapter: { label: string; explanation: string } | null
  overviewChapter: { label: string; explanation: string } | null
  totalChapters: number
  history: { role: string; content: string }[]
  storyFile: string
}

/**
 * Derive a language identifier from a file path extension for fenced code blocks.
 */
function langFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
    java: 'java', kt: 'kotlin', swift: 'swift', cs: 'csharp',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    yml: 'yaml', yaml: 'yaml', json: 'json', toml: 'toml',
    md: 'markdown', sql: 'sql', html: 'html', css: 'css', scss: 'scss',
  }
  return map[ext] || ext
}

export function buildChatPrompt(input: BuildChatPromptInput): string {
  const {
    message, title, repo,
    currentChapter, prevChapter, nextChapter, overviewChapter,
    totalChapters, history, storyFile,
  } = input

  const lines: string[] = []

  lines.push(`You are an expert assistant helping a reader understand a code walkthrough.`)
  if (repo) {
    lines.push(`Repository: ${repo}`)
  }
  lines.push(`Story: "${title}"`)
  lines.push(``)

  // Include overview if it's not the current chapter
  if (overviewChapter) {
    lines.push(`== Story Overview: "${overviewChapter.label}" ==`)
    lines.push(overviewChapter.explanation)
    lines.push(``)
  }

  lines.push(`== Current Chapter: "${currentChapter.label}" ==`)

  if (currentChapter.snippets.length > 0) {
    lines.push(`Code snippets from this chapter:`)
    for (const snippet of currentChapter.snippets) {
      const lang = langFromPath(snippet.filePath)
      if (snippet.type === 'diff' && snippet.lines) {
        lines.push(`File: ${snippet.filePath} (diff)`)
        lines.push('```diff')
        for (const line of snippet.lines) {
          const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '
          lines.push(`${prefix}${line.content}`)
        }
        lines.push('```')
      } else {
        lines.push(`File: ${snippet.filePath}`)
        lines.push(`\`\`\`${lang}`)
        lines.push(snippet.content)
        lines.push('```')
      }
      lines.push(``)
    }
  }

  lines.push(`Explanation:`)
  lines.push(currentChapter.explanation)
  lines.push(``)

  if (prevChapter) {
    lines.push(`== Previous Chapter: "${prevChapter.label}" ==`)
    lines.push(prevChapter.explanation)
    lines.push(``)
  }

  if (nextChapter) {
    lines.push(`== Next Chapter: "${nextChapter.label}" ==`)
    lines.push(nextChapter.explanation)
    lines.push(``)
  }

  lines.push(`The story has ${totalChapters} chapters total. If the reader's question relates to content in other chapters, you may reference it.`)
  lines.push(``)

  // Truncate history to last N messages
  const truncatedHistory = history.slice(-MAX_HISTORY_MESSAGES)
  if (truncatedHistory.length > 0) {
    if (truncatedHistory.length < history.length) {
      lines.push(`Prior conversation (last ${truncatedHistory.length} of ${history.length} messages):`)
    } else {
      lines.push(`Prior conversation:`)
    }
    for (const m of truncatedHistory) {
      lines.push(`${m.role}: ${m.content}`)
    }
    lines.push(``)
  }

  lines.push(`You have access to the Read tool. If you need more context to answer the question:`)
  lines.push(`- Full story JSON (all chapters): ${storyFile}`)
  lines.push(`Only read these files if the provided context above is insufficient.`)
  lines.push(``)
  lines.push(`Reader's question: ${message}`)
  lines.push(``)
  lines.push(`Respond concisely. Use fenced code blocks with language tags when showing code examples.`)

  return lines.join('\n')
}

// Simple per-file lock to prevent concurrent writes to the same chat file
const fileLocks = new Map<string, Promise<void>>()

export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing lock on this file
  while (fileLocks.has(filePath)) {
    await fileLocks.get(filePath)
  }

  let releaseLock: () => void
  const lockPromise = new Promise<void>(resolve => { releaseLock = resolve })
  fileLocks.set(filePath, lockPromise)

  try {
    return await fn()
  } finally {
    fileLocks.delete(filePath)
    releaseLock!()
  }
}
