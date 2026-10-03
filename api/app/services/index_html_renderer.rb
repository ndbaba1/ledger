# Renders public/index.html (the built frontend) for the SPA fallback route,
# substituting APP_URL into the site-wide defaults baked in at build time
# (see web/index.html) and, for a handful of public routes, overriding the
# title/description/og:*/canonical with real data — so a link shared on
# LinkedIn or Reddit gets a real preview instead of the site default.
#
# Only ever reads PUBLIC data (a published Post, a User's public profile
# fields) — a draft, a private record, or anything else isn't reachable
# through the routes this matches, so there's nothing to leak.
class IndexHtmlRenderer
  APP_URL_TOKEN = '__APP_URL__'

  Result = Struct.new(:html, :status)

  def self.render(path)
    new(path).render
  end

  def initialize(path)
    @path = path
  end

  def render
    html = template.gsub(APP_URL_TOKEN, app_url)
    overrides = page_overrides
    return Result.new(html, 200) unless overrides

    Result.new(apply(html, overrides), overrides.fetch(:status, 200))
  end

  private

  attr_reader :path

  # Not public/index.html: ActionDispatch::Static serves a literal
  # public/index.html directly for "/" (its default index_name), bypassing
  # this renderer's per-page meta and APP_URL substitution entirely.
  def template
    File.read(Rails.root.join('app/views/static/index.html'))
  end

  def app_url
    Rails.application.config.x.app_url
  end

  # nil means "no override — serve the site-wide defaults as they are".
  def page_overrides
    case path.split('/').reject(&:blank?)
    in ['u', handle, slug]
      post_overrides(handle, slug)
    in ['u', handle]
      profile_overrides(handle)
    else
      nil
    end
  end

  def post_overrides(handle, slug)
    user = User.find_by(handle: handle)
    post = user&.posts&.find_by(slug: slug)
    return { status: 404 } unless post

    body = post.sections.first.is_a?(Hash) ? post.sections.first['body'] : nil
    {
      title: post.title,
      description: MarkdownPreview.excerpt(body.to_s),
      url: "#{app_url}/u/#{handle}/#{slug}",
      type: 'article',
      article_author: user.name
    }
  end

  def profile_overrides(handle)
    user = User.find_by(handle: handle)
    return { status: 404 } unless user

    {
      title: "#{user.name} on EngLog",
      description: user.headline.presence || "Engineering records by #{user.name} on EngLog.",
      url: "#{app_url}/u/#{handle}"
    }
  end

  def apply(html, overrides)
    doc = Nokogiri::HTML5.parse(html)
    set_title(doc, overrides[:title]) if overrides[:title]
    set_meta(doc, 'name', 'description', overrides[:description])
    set_meta(doc, 'property', 'og:title', overrides[:title])
    set_meta(doc, 'property', 'og:description', overrides[:description])
    set_meta(doc, 'property', 'og:type', overrides[:type]) if overrides[:type]
    set_meta(doc, 'property', 'og:url', overrides[:url])
    set_meta(doc, 'name', 'twitter:title', overrides[:title])
    set_meta(doc, 'name', 'twitter:description', overrides[:description])
    set_link(doc, 'canonical', overrides[:url])
    add_article_author(doc, overrides[:article_author]) if overrides[:article_author]
    doc.to_html
  end

  def set_title(doc, value)
    node = doc.at_css('title')
    node.content = value if node
  end

  def set_meta(doc, attr, key, value)
    return unless value

    node = doc.at_css(%(meta[#{attr}="#{key}"]))
    node['content'] = value if node
  end

  def set_link(doc, rel, value)
    return unless value

    node = doc.at_css(%(link[rel="#{rel}"]))
    node['href'] = value if node
  end

  def add_article_author(doc, name)
    node = Nokogiri::XML::Node.new('meta', doc)
    node['property'] = 'article:author'
    node['content'] = name
    doc.at_css('head') << node
  end
end
