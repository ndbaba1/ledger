# Plain-text excerpts for meta descriptions. Mirrors the small Markdown
# subset `stripInline` strips in web/src/lib/inline.ts (`code`, **bold**,
# *italic*, [text](url), [S1] citations) — not full Markdown, just this
# app's own records/write-ups syntax.
module MarkdownPreview
  def self.strip(text)
    return '' if text.blank?

    text
      .gsub(/\s*\[S\d+\]/, '')
      .gsub(/^```.*$/, '')
      .gsub(/`([^`]+)`/, '\1')
      .gsub(%r{\[([^\]]+)\]\((https?://[^)\s]+)\)}, '\1')
      .gsub(/\*\*([^*]+)\*\*/, '\1')
      .gsub(/\*([^*\s][^*]*)\*/, '\1')
      .gsub(/^\s*(?:[-*]|\d+\.)\s+/, '')
      .gsub(/\n{2,}/, "\n")
      .strip
  end

  def self.excerpt(text, length: 160)
    strip(text).truncate(length, separator: ' ')
  end
end
