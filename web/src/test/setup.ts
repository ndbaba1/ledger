import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

// jsdom does not implement these.
Element.prototype.scrollIntoView = function scrollIntoView() {}
window.scrollTo = () => {}

// ProseMirror measures layout; jsdom returns nothing, so give it empty rects.
const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) }
Range.prototype.getBoundingClientRect = () => emptyRect as DOMRect
Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
document.elementFromPoint = () => null

// jsdom does not implement this either.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error jsdom has no IntersectionObserver
window.IntersectionObserver = MockIntersectionObserver
