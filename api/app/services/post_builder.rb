# Turns a write-up into its public post: the Ruby port of `sectionsFor` /
# `buildPost` (web/src/lib/publicPost.ts) plus the badge and slug logic that
# used to live in mockApi's publishWriteup / publishPost.
class PostBuilder
  ROOT_CAUSE_LABEL = { 'incident' => 'Root cause', 'investigation' => 'Root cause', 'decision' => 'Decision', 'design' => 'Design' }.freeze

  def self.call(writeup, at: Time.current)
    new(writeup).build(at)
  end

  def self.slugify(text)
    ActiveSupport::Inflector.transliterate(text.to_s)
      .downcase.strip
      .gsub(/[^\w\s-]/, '')
      .gsub(/[\s_]+/, '-')
      .gsub(/-+/, '-')
      .split('-').first(8).join('-')
  end

  def initialize(writeup)
    @writeup = writeup
    @fields = writeup.fields || {}
  end

  def build(at)
    Post.new(
      user: @writeup.user,
      writeup: @writeup,
      slug: unique_slug,
      type: @writeup.type,
      title: @writeup.title,
      tags: [],
      summary: (field('lesson').presence || field('rootCause')).to_s,
      context: field('context').presence,
      decision: @writeup.type == 'decision' ? field('rootCause') : nil,
      sections: sections.select { |s| s['body'].to_s.strip.present? },
      result: field('result'),
      lesson: field('lesson').presence,
      badges: badges,
      follow_ups: [],
      published_at: at
    )
  end

  # Mirrors `sectionsFor` in web/src/lib/publicPost.ts exactly (including
  # sections with a blank body) so it can be tested against the same fixture.
  def sections
    notes = [] # no folded public Q&A answers to fold in for a v1 write-up
    case @writeup.type
    when 'design'
      [
        section('Goal', field('symptom'), 'text'),
        *list_section('Constraints', field('constraints'), 'list'),
        section('Design', field('rootCause'), 'text'),
        *list_section('Architecture', field('flow'), 'flow'),
        *list_section('Alternatives', field('ruledOut'), 'rejected'),
        section('Rollout', field('fix'), 'text'),
        *notes
      ]
    when 'decision'
      [
        section('Context', field('symptom'), 'text'),
        *list_section('Options considered', field('ruledOut'), 'rejected'),
        section('Consequences', field('fix'), 'text'),
        *notes
      ]
    else
      [
        section('Problem', field('symptom'), 'text'),
        *list_section('Investigation', field('ruledOut'), 'dead_ends'),
        section(ROOT_CAUSE_LABEL.fetch(@writeup.type), field('rootCause'), 'text'),
        section('Solution', field('fix'), 'text'),
        *notes
      ]
    end
  end

  private

  def field(key) = @fields[key]

  def section(heading, body, kind) = { 'heading' => heading, 'body' => body.to_s, 'kind' => kind }

  def list_section(heading, items, kind)
    return [] if items.blank?

    [{ 'heading' => heading, 'body' => items.map { |x| "- #{x}" }.join("\n"), 'kind' => kind }]
  end

  def badges
    @writeup.evidence.filter_map { |e| e.badge(@writeup.type) }
  end

  def unique_slug
    base = self.class.slugify(@writeup.title)
    base = 'untitled' if base.blank?
    slug = base
    n = 2
    while @writeup.user.posts.exists?(slug: slug)
      slug = "#{base}-#{n}"
      n += 1
    end
    slug
  end
end
