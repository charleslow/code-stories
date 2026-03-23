import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Tests that GFM tables render as proper HTML table elements
 * when using the same ReactMarkdown + remarkGfm setup as ChatPanel.
 */
describe('ChatPanel table rendering', () => {
  function renderMarkdown(content: string) {
    return render(
      <div className="chat-message-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>,
    )
  }

  it('renders a GFM table as an HTML table', () => {
    const markdown = [
      '| Concept | axum | FastAPI |',
      '|---|---|---|',
      '| Register state | `.with_state(state)` | `app.state.store = ...` |',
      '| Route definition | `.route("/path", get(handler))` | `@app.get("/path")` |',
    ].join('\n')

    renderMarkdown(markdown)

    const table = document.querySelector('.chat-message-content table')
    expect(table).toBeInTheDocument()

    // Check headers
    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(3)
    expect(headers[0]).toHaveTextContent('Concept')
    expect(headers[1]).toHaveTextContent('axum')
    expect(headers[2]).toHaveTextContent('FastAPI')

    // Check data rows
    const rows = screen.getAllByRole('row')
    // 1 header row + 2 data rows
    expect(rows).toHaveLength(3)
  })

  it('renders table cells with inline code', () => {
    const markdown = [
      '| Method | Syntax |',
      '|---|---|',
      '| Extract | `State(s): State<T>` |',
    ].join('\n')

    const { container } = renderMarkdown(markdown)

    const code = container.querySelector('table code')
    expect(code).toBeInTheDocument()
    expect(code).toHaveTextContent('State(s): State<T>')
  })

  it('does not render a table without remark-gfm', () => {
    const markdown = [
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n')

    // Render WITHOUT remarkGfm — tables should not parse
    const { container } = render(
      <div className="chat-message-content">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </div>,
    )

    expect(container.querySelector('table')).toBeNull()
  })
})
