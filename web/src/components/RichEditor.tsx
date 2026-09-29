import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { docToMarkdown, markdownToHtml, type EditorNode } from '../lib/markdown'
import { Icon } from './Icon'

interface RichEditorProps {
  id: string
  /** Markdown. Read on mount; the editor owns the text afterwards. */
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  labelledBy: string
  describedBy?: string
}

/**
 * A rich-text editor for one section. Supports what records render: bold,
 * italic, inline code, links, bullet and numbered lists, and code blocks.
 * Markdown shortcuts work while typing (`- `, `1. `, ``` and `code`).
 */
export function RichEditor({ id, value, onChange, placeholder, labelledBy, describedBy }: RichEditorProps) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https'],
          HTMLAttributes: { rel: 'noreferrer noopener', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: markdownToHtml(value),
    editorProps: {
      attributes: {
        id,
        class: 'rich__content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelledBy,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(docToMarkdown(e.getJSON() as EditorNode)),
  })

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            code: e.isActive('code'),
            link: e.isActive('link'),
            bulletList: e.isActive('bulletList'),
            orderedList: e.isActive('orderedList'),
            codeBlock: e.isActive('codeBlock'),
          }
        : null,
  })

  const [linkOpen, setLinkOpen] = useState(false)
  const [href, setHref] = useState('')

  if (!editor) return <div className="rich rich--loading" aria-busy="true" />

  const chain = () => editor.chain().focus()

  const openLink = () => {
    setHref((editor.getAttributes('link').href as string | undefined) ?? '')
    setLinkOpen(true)
  }
  const applyLink = (e: FormEvent) => {
    e.preventDefault()
    const url = href.trim()
    if (!url) chain().extendMarkRange('link').unsetLink().run()
    else if (/^https?:\/\//.test(url)) chain().extendMarkRange('link').setLink({ href: url }).run()
    else return
    setLinkOpen(false)
  }

  const tools: { key: keyof NonNullable<typeof state>; label: string; icon: string; run: () => void }[] = [
    { key: 'bold', label: 'Bold', icon: 'B', run: () => chain().toggleBold().run() },
    { key: 'italic', label: 'Italic', icon: 'I', run: () => chain().toggleItalic().run() },
    { key: 'code', label: 'Inline code', icon: '</>', run: () => chain().toggleCode().run() },
    { key: 'link', label: 'Link', icon: 'link', run: openLink },
    { key: 'bulletList', label: 'Bulleted list', icon: '•', run: () => chain().toggleBulletList().run() },
    { key: 'orderedList', label: 'Numbered list', icon: '1.', run: () => chain().toggleOrderedList().run() },
    { key: 'codeBlock', label: 'Code block', icon: '{ }', run: () => chain().toggleCodeBlock().run() },
  ]

  return (
    <div className="rich">
      <div className="rich__toolbar" role="toolbar" aria-label="Formatting" aria-controls={id}>
        {tools.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`rich__tool rich__tool--${t.key}`}
            aria-label={t.label}
            title={t.label}
            aria-pressed={Boolean(state?.[t.key])}
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.run}
          >
            {t.icon === 'link' ? <Icon name="link" size={14} /> : t.icon}
          </button>
        ))}
      </div>
      {linkOpen && (
        <form className="rich__link" onSubmit={applyLink}>
          <label htmlFor={`${id}-href`} className="sr-only">
            Link address
          </label>
          <input
            id={`${id}-href`}
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={href}
            autoFocus
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setLinkOpen(false)}
          />
          <button type="submit" className="btn btn--sm">
            {href.trim() ? 'Apply' : 'Remove link'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLinkOpen(false)}>
            Cancel
          </button>
        </form>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
