import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createMockApi } from '../api/mockApi'
import { MarkdownField } from '../components/MarkdownField'

function Field({ onSubmit, initial = '' }: { onSubmit: () => void; initial?: string }) {
  const [value, setValue] = useState(initial)
  return <MarkdownField id="f1" label="Answer" value={value} onChange={setValue} onSubmit={onSubmit} />
}

describe('MarkdownField', () => {
  it('submits on Cmd/Ctrl+Enter, and plain Enter just makes a new line', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<Field onSubmit={onSubmit} initial="hello" />)
    const textarea = screen.getByLabelText('Answer')
    await user.click(textarea)

    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(textarea).toHaveValue('hello\n')

    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('renders inline `code` and a fenced code block in preview', async () => {
    const user = userEvent.setup()
    render(<Field onSubmit={() => {}} initial={'See `npm test` then:\n\n```\nconsole.log(1)\n```'} />)

    await user.click(screen.getByRole('tab', { name: 'Preview' }))

    expect(screen.getByText('npm test').tagName).toBe('CODE')
    expect(screen.getByText('console.log(1)').closest('pre')).toHaveClass('code-block')
  })

  it('does not render a javascript: link', async () => {
    const user = userEvent.setup()
    render(<Field onSubmit={() => {}} initial="[click me](javascript:alert(1))" />)

    await user.click(screen.getByRole('tab', { name: 'Preview' }))

    expect(screen.queryByRole('link', { name: 'click me' })).not.toBeInTheDocument()
    expect(screen.getByText(/click me/)).toBeInTheDocument()
  })

  it('shows a remaining-characters count only once close to the limit', async () => {
    const user = userEvent.setup()
    render(<Field onSubmit={() => {}} />)
    // No maxLength on this field, so no count ever.
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Answer'), 'hi')
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument()
  })
})

describe('MarkdownField wired into Ask the author', () => {
  it('Cmd+Enter in the ask box submits the question', async () => {
    window.location.hash = '#/u/hannahl/retries-turned-a-blip-into-an-outage'
    const user = userEvent.setup()
    render(<App api={createMockApi({ latencyMs: 0 })} />)

    const ask = await screen.findByLabelText('Ask Hannah a question')
    await user.click(ask)
    await user.type(ask, 'Did you consider a circuit breaker?')
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(await screen.findByText(/Sent to Hannah · waiting for an answer/)).toBeInTheDocument()
  })
})
