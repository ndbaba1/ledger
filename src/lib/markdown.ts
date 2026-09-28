import { tokenizeInline } from './inline'

/** Block structure of a Markdown text field. */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[]; start: number }
  | { type: 'code'; lang: string; code: string }

const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBERED = /^\s*(\d+)\.\s+(.*)$/

/** Split Markdown into paragraphs, lists and fenced code blocks. */
export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ type: 'p', text: para.join(' ').trim() })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(/^```\s*([\w+-]*)\s*$/)
    if (fence) {
      flush()
      const code: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++])
      out.push({ type: 'code', lang: fence[1], code: code.join('\n') })
      continue
    }
    const bullet = line.match(BULLET)
    const numbered = line.match(NUMBERED)
    if (bullet) {
      flush()
      const prev = out[out.length - 1]
      if (prev?.type === 'ul') prev.items.push(bullet[1])
      else out.push({ type: 'ul', items: [bullet[1]] })
      continue
    }
    if (numbered) {
      flush()
      const prev = out[out.length - 1]
      if (prev?.type === 'ol') prev.items.push(numbered[2])
      else out.push({ type: 'ol', items: [numbered[2]], start: Number(numbered[1]) })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    para.push(line.trim())
  }
  flush()
  return out
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inlineToHtml(text: string): string {
  return tokenizeInline(text)
    .map((t) => {
      switch (t.type) {
        case 'text':
          return escapeHtml(t.value)
        case 'code':
          return `<code>${escapeHtml(t.value)}</code>`
        case 'bold':
          return `<strong>${inlineToHtml(t.value)}</strong>`
        case 'italic':
          return `<em>${inlineToHtml(t.value)}</em>`
        case 'link':
          return `<a href="${escapeHtml(t.href)}">${escapeHtml(t.text)}</a>`
        case 'cite':
          return escapeHtml(`[${t.key}]`)
        case 'ref':
          return escapeHtml(`[${t.n}]`)
      }
    })
    .join('')
}

/** Markdown → HTML for loading a field into the rich-text editor. All text is escaped. */
export function markdownToHtml(md: string): string {
  return parseBlocks(md)
    .map((b) => {
      if (b.type === 'p') return `<p>${inlineToHtml(b.text)}</p>`
      if (b.type === 'code') return `<pre><code${b.lang ? ` class="language-${escapeHtml(b.lang)}"` : ''}>${escapeHtml(b.code)}</code></pre>`
      const tag = b.type === 'ul' ? 'ul' : 'ol'
      const start = b.type === 'ol' && b.start !== 1 ? ` start="${b.start}"` : ''
      return `<${tag}${start}>${b.items.map((i) => `<li><p>${inlineToHtml(i)}</p></li>`).join('')}</${tag}>`
    })
    .join('')
}

/** The subset of ProseMirror/TipTap JSON the editor produces. */
export interface EditorNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: EditorNode[]
}

function inlineToMarkdown(nodes: EditorNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return ' '
      if (n.type !== 'text' || !n.text) return ''
      const marks = new Map((n.marks ?? []).map((m) => [m.type, m]))
      let s = n.text
      if (marks.has('code')) {
        s = `\`${s}\``
      } else {
        if (marks.has('italic')) s = `*${s}*`
        if (marks.has('bold')) s = `**${s}**`
      }
      const link = marks.get('link')
      const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : ''
      if (link && /^https?:\/\//.test(href)) s = `[${s}](${href})`
      return s
    })
    .join('')
}

/** Editor JSON → Markdown, the format fields are stored in. */
export function docToMarkdown(doc: EditorNode): string {
  const blocks = (doc.content ?? []).map((node): string => {
    switch (node.type) {
      case 'paragraph':
        return inlineToMarkdown(node.content)
      case 'codeBlock': {
        const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
        const code = (node.content ?? []).map((t) => t.text ?? '').join('')
        return `\`\`\`${lang}\n${code}\n\`\`\``
      }
      case 'bulletList':
      case 'orderedList': {
        const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1
        return (node.content ?? [])
          .map((item, i) => {
            const text = (item.content ?? []).map((p) => inlineToMarkdown(p.content)).join(' ')
            return node.type === 'bulletList' ? `- ${text}` : `${start + i}. ${text}`
          })
          .join('\n')
      }
      default:
        return inlineToMarkdown(node.content)
    }
  })
  return blocks
    .filter((b) => b.trim().length > 0)
    .join('\n\n')
}
