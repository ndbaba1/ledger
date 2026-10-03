import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Logo } from '../app/AppShell'

describe('Logo', () => {
  it('renders the favicon mark and the dark-bg wordmark as images', () => {
    render(<Logo />)
    const images = document.querySelectorAll('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', '/brand/favicon.svg')
    expect(images[1]).toHaveAttribute('src', '/brand/wordmark-dark-bg.svg')
  })

  it('omits the wordmark when compact, keeping only the mark', () => {
    render(<Logo compact />)
    const images = document.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveAttribute('src', '/brand/favicon.svg')
  })
})
