import { describe, expect, it } from 'vitest'
import { docToMarkdown, markdownToHtml, parseBlocks } from '../lib/markdown'
import { stripInline, tokenizeInline } from '../lib/inline'

describe('markdown blocks', () => {
  it('splits paragraphs, lists and fenced code', () => {
    const md = 'First line\ncontinues.\n\n- one\n- two\n\n3. three\n4. four\n\n```sql\nSHOW POOLS;\n```\nAfter.'
    expect(parseBlocks(md)).toEqual([
      { type: 'p', text: 'First line continues.' },
      { type: 'ul', items: ['one', 'two'] },
      { type: 'ol', items: ['three', 'four'], start: 3 },
      { type: 'code', lang: 'sql', code: 'SHOW POOLS;' },
      { type: 'p', text: 'After.' },
    ])
  })

  it('escapes everything when producing editor HTML', () => {
    expect(markdownToHtml('<script>alert(1)</script> **bold** [x](javascript:alert(1))')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; <strong>bold</strong> [x](javascript:alert(1))</p>',
    )
  })
})

describe('inline formatting', () => {
  it('tokenizes bold, italic, links and code without touching snake_case', () => {
    expect(tokenizeInline('**Pool** is *tiny*, see [docs](https://x.dev/a) and `cl_waiting`')).toEqual([
      { type: 'bold', value: 'Pool' },
      { type: 'text', value: ' is ' },
      { type: 'italic', value: 'tiny' },
      { type: 'text', value: ', see ' },
      { type: 'link', text: 'docs', href: 'https://x.dev/a' },
      { type: 'text', value: ' and ' },
      { type: 'code', value: 'cl_waiting' },
    ])
    expect(tokenizeInline('workers × threads × pods')).toEqual([{ type: 'text', value: 'workers × threads × pods' }])
  })

  it('strips formatting for excerpts', () => {
    expect(stripInline('**Bold** and [a link](https://x.dev)\n- item [S2]')).toBe('Bold and a link\nitem')
  })
})

describe('editor JSON to markdown', () => {
  it('serializes marks, lists and code blocks', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Set ' },
            { type: 'text', text: 'pool_size', marks: [{ type: 'code' }] },
            { type: 'text', text: ' ' },
            { type: 'text', text: 'carefully', marks: [{ type: 'bold' }, { type: 'italic' }] },
            { type: 'text', text: ' — ' },
            { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://x.dev' } }] },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Revert' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alert' }] }] },
          ],
        },
        { type: 'codeBlock', attrs: { language: 'sql' }, content: [{ type: 'text', text: 'SHOW POOLS;' }] },
        { type: 'paragraph' },
      ],
    }
    expect(docToMarkdown(doc)).toBe(
      'Set `pool_size` ***carefully*** — [docs](https://x.dev)\n\n1. Revert\n2. Alert\n\n```sql\nSHOW POOLS;\n```',
    )
  })

  it('drops links that are not http(s)', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }],
    }
    expect(docToMarkdown(doc)).toBe('x')
  })

  it('round-trips through editor HTML structure', () => {
    const md = 'A **b** `c`\n\n- d\n- e'
    expect(parseBlocks(md)).toEqual(parseBlocks(docToMarkdown({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A ' }, { type: 'text', text: 'b', marks: [{ type: 'bold' }] }, { type: 'text', text: ' ' }, { type: 'text', text: 'c', marks: [{ type: 'code' }] }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'd' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'e' }] }] },
        ] },
      ],
    })))
  })
})
