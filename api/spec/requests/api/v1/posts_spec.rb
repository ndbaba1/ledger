require 'rails_helper'

RSpec.describe 'Post, thread and hit endpoints', type: :request do
  let(:author) { create(:user, handle: 'hannahl') }
  let(:post_record) { create(:post, user: author, title: 'Retries turned a blip into an outage') }

  describe 'GET /api/v1/users/:handle/posts/:slug' do
    it 'returns the post and its author' do
      get "/api/v1/users/hannahl/posts/#{post_record.slug}"
      expect(response).to have_http_status(:ok)
      expect(json['post']['title']).to eq('Retries turned a blip into an outage')
      expect(json['author']['handle']).to eq('hannahl')
    end

    it '404s for an unknown slug' do
      get '/api/v1/users/hannahl/posts/nope'
      expect(response).to have_http_status(:not_found)
    end

    it 'includes verified and unverified evidence, but never failed evidence' do
      writeup = post_record.writeup
      create(:evidence, writeup: writeup, key: 'S1', kind: 'github_pr', authored_by_user: true,
                         repo: 'acme/checkout', url: 'https://github.com/acme/checkout/pull/1')
      create(:evidence, writeup: writeup, key: 'S2', kind: 'github_pr', authored_by_user: false,
                         repo: 'acme/checkout', url: 'https://github.com/acme/checkout/pull/2')
      create(:evidence, writeup: writeup, key: 'S3', kind: 'link', status: 'linked', url: 'https://example.com/notes')
      create(:evidence, writeup: writeup, key: 'S4', kind: 'github_pr', status: 'failed',
                         failure_reason: 'Private repo — not supported yet.', url: 'https://github.com/acme/secret/pull/9')

      get "/api/v1/users/hannahl/posts/#{post_record.slug}"

      urls = json['post']['evidence'].map { |e| e['url'] }
      expect(urls).to contain_exactly(
        'https://github.com/acme/checkout/pull/1',
        'https://github.com/acme/checkout/pull/2',
        'https://example.com/notes'
      )
      expect(json['post']['evidence'].map { |e| e['verified'] }).to contain_exactly(true, false, false)
    end
  end

  describe 'GET .../thread' do
    it 'returns an empty thread when nobody has asked anything yet' do
      get "/api/v1/users/hannahl/posts/#{post_record.slug}/thread"
      expect(response).to have_http_status(:ok)
      expect(json).to eq('questions' => [], 'askers' => [], 'mine' => [], 'hitCount' => 0, 'hitByMe' => false)
    end
  end

  describe 'POST .../hit' do
    it 'requires sign-in' do
      post_json "/api/v1/users/hannahl/posts/#{post_record.slug}/hit"
      expect(response).to have_http_status(:unauthorized)
    end

    it 'toggles a hit on and back off' do
      reader = create(:user)
      sign_in_as(reader)

      post_json "/api/v1/users/hannahl/posts/#{post_record.slug}/hit"
      expect(response).to have_http_status(:ok)
      expect(json['hitCount']).to eq(1)
      expect(json['hitByMe']).to eq(true)

      post_json "/api/v1/users/hannahl/posts/#{post_record.slug}/hit"
      expect(json['hitCount']).to eq(0)
      expect(json['hitByMe']).to eq(false)
    end

    it "forbids hitting your own post" do
      sign_in_as(author)
      post_json "/api/v1/users/hannahl/posts/#{post_record.slug}/hit"
      expect(response).to have_http_status(:forbidden)
    end
  end
end
