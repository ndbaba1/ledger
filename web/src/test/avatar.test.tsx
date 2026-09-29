import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Avatar } from '../components/Avatar'

const base = { initials: 'NN', avatarHue: 220, name: 'Nnamdi' }

describe('Avatar', () => {
  it('shows initials when there is no avatarUrl', () => {
    render(<Avatar user={base} />)
    expect(screen.getByText('NN')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the image when there is an avatarUrl', () => {
    render(<Avatar user={{ ...base, avatarUrl: 'https://avatars.example/nnamdi.png' }} />)
    const img = screen.getByRole('img', { name: 'Nnamdi' })
    expect(img).toHaveAttribute('src', 'https://avatars.example/nnamdi.png')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('falls back to initials if the image fails to load', () => {
    render(<Avatar user={{ ...base, avatarUrl: 'https://avatars.example/broken.png' }} />)
    const img = screen.getByRole('img', { name: 'Nnamdi' })
    fireEvent.error(img)
    expect(screen.getByText('NN')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
