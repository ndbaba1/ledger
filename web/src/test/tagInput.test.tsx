import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TagInput } from '../components/TagInput'

function Harness({ initial = [] as string[], max = 12 }) {
  const [tags, setTags] = useState<string[]>(initial)
  return <TagInput id="tags" tags={tags} onChange={setTags} max={max} />
}

describe('TagInput', () => {
  it('adds a tag on Enter and on comma', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox')

    await user.type(input, 'go{Enter}')
    expect(screen.getByText('go')).toBeInTheDocument()

    await user.type(input, 'postgres,')
    expect(screen.getByText('postgres')).toBeInTheDocument()
  })

  it('removes the last tag with Backspace on an empty field', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['go', 'postgres']} />)

    await user.click(screen.getByRole('textbox'))
    await user.keyboard('{Backspace}')

    expect(screen.queryByText('postgres')).not.toBeInTheDocument()
    expect(screen.getByText('go')).toBeInTheDocument()
  })

  it('does not remove a tag when the field has text', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['go']} />)

    await user.type(screen.getByRole('textbox'), 'post')
    await user.keyboard('{Backspace}')

    expect(screen.getByText('go')).toBeInTheDocument()
  })

  it('adds every tag from a paste like "go, postgres"', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox')
    input.focus()
    await user.paste('go, postgres')

    expect(screen.getByText('go')).toBeInTheDocument()
    expect(screen.getByText('postgres')).toBeInTheDocument()
  })

  it('ignores a duplicate tag', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['go']} />)

    await user.type(screen.getByRole('textbox'), 'go{Enter}')

    expect(screen.getAllByText('go')).toHaveLength(1)
  })

  it('stops adding tags at the max', async () => {
    const user = userEvent.setup()
    render(<Harness initial={Array.from({ length: 11 }, (_, i) => `tag${i}`)} max={12} />)

    await user.type(screen.getByRole('textbox'), 'twelfth{Enter}')
    expect(screen.getByText('twelfth')).toBeInTheDocument()

    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input).toBeDisabled()
    expect(screen.queryByText('thirteenth')).not.toBeInTheDocument()
  })
})
