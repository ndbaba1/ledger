require 'rails_helper'

RSpec.describe 'SPA fallback and per-page meta', type: :request do
  let(:author) { create(:user, handle: 'hannahl', name: 'Hannah L.', headline: 'Staff engineer · payments') }

  describe 'a published record' do
    let!(:post) do
      create(
        :post,
        user: author,
        slug: 'checkout-p99-latency',
        title: 'Checkout p99 latency hit 4.2s',
        sections: [{ 'heading' => 'Problem', 'body' => "A **bold** problem statement with a [link](https://example.com) and a [S1] citation that runs on long enough to need truncating at roughly a hundred and sixty characters, well past that point in fact." }]
      )
    end

    it "sets og:title to the record's title, og:type to article, and article:author to the author's name" do
      get "/u/#{author.handle}/#{post.slug}"

      expect(response).to have_http_status(:ok)
      expect(response.body).to include('<title>Checkout p99 latency hit 4.2s</title>')
      expect(response.body).to include('property="og:title" content="Checkout p99 latency hit 4.2s"')
      expect(response.body).to include('property="og:type" content="article"')
      expect(response.body).to include('property="article:author" content="Hannah L."')
      expect(response.body).to include(%(property="og:url" content="#{Rails.application.config.x.app_url}/u/hannahl/checkout-p99-latency"))
      expect(response.body).to include(%(rel="canonical" href="#{Rails.application.config.x.app_url}/u/hannahl/checkout-p99-latency"))
    end

    it "excerpts the first section's body, stripped of markdown, to roughly 160 characters" do
      get "/u/#{author.handle}/#{post.slug}"

      match = response.body.match(/property="og:description" content="([^"]*)"/)
      expect(match).to be_present
      description = match[1]
      expect(description).to start_with('A bold problem statement with a link and a citation')
      expect(description).not_to include('**')
      expect(description).not_to include('[S1]')
      expect(description.length).to be <= 161 # 160 plus the "…" truncation marker
    end

    it 'HTML-escapes the title' do
      post.update!(title: 'Postgres <script>alert(1)</script> & "friends"')

      get "/u/#{author.handle}/#{post.slug}"

      # <title>'s content can't contain a parsed tag (it's RCDATA) either
      # way, but Nokogiri escapes it regardless.
      expect(response.body).to include('<title>Postgres &lt;script&gt;alert(1)&lt;/script&gt; &amp; "friends"</title>')
      # A literal `"` is what actually matters for the og:title *attribute* —
      # unescaped, it would close the attribute early.
      expect(response.body).to include('property="og:title" content="Postgres <script>alert(1)</script> &amp; &quot;friends&quot;"')
      expect(response.body).not_to include('content="Postgres <script>alert(1)</script> & "friends""')
    end
  end

  describe 'an unknown slug' do
    it 'returns the site defaults with a 404 status, never a leaked title' do
      get "/u/#{author.handle}/does-not-exist"

      expect(response).to have_http_status(:not_found)
      expect(response.body).to include('<title>EngLog</title>')
      expect(response.body).to include('property="og:title" content="EngLog — Verified engineering work"')
    end
  end

  describe 'a draft, never published as a Post' do
    it "is never reachable through the public record URL, so its title can't leak" do
      writeup = create(:writeup, user: author, title: 'Secret draft nobody should see')

      get "/u/#{author.handle}/#{writeup.id}"

      expect(response).to have_http_status(:not_found)
      expect(response.body).not_to include('Secret draft nobody should see')
      expect(response.body).to include('<title>EngLog</title>')
    end
  end

  describe 'a profile' do
    it 'sets the title and description from the public profile, with a headline' do
      get "/u/#{author.handle}"

      expect(response).to have_http_status(:ok)
      expect(response.body).to include('<title>Hannah L. on EngLog</title>')
      expect(response.body).to include('property="og:description" content="Staff engineer · payments"')
      expect(response.body).to include(%(property="og:url" content="#{Rails.application.config.x.app_url}/u/hannahl"))
    end

    it 'falls back to a generic description without a headline' do
      plain = create(:user, handle: 'plainjane', name: 'Jane Plain', headline: nil)

      get "/u/#{plain.handle}"

      expect(response.body).to include('property="og:description" content="Engineering records by Jane Plain on EngLog."')
    end

    it 'returns the site defaults with a 404 status for an unknown handle' do
      get '/u/nobody-at-all'

      expect(response).to have_http_status(:not_found)
      expect(response.body).to include('<title>EngLog</title>')
    end
  end

  describe 'everything else' do
    it 'serves the site-wide defaults for an ordinary app route' do
      get '/records'

      expect(response).to have_http_status(:ok)
      expect(response.body).to include('<title>EngLog</title>')
      expect(response.body).to include('property="og:title" content="EngLog — Verified engineering work"')
      expect(response.body).to include(%(property="og:url" content="#{Rails.application.config.x.app_url}"))
    end

    it 'substitutes APP_URL into the og:image URL' do
      get '/'

      expect(response.body).to include(%(property="og:image" content="#{Rails.application.config.x.app_url}/brand/og-image.png"))
    end
  end

  describe 'the API' do
    it 'is unaffected by the SPA fallback' do
      get '/api/v1/explore'

      expect(response.content_type).to include('application/json')
      expect(response.body).not_to include('<!doctype html>')
    end
  end
end
