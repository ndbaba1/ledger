require 'rails_helper'

RSpec.describe 'Writeups API', type: :request do
  let(:user) { create(:user) }

  describe 'GET /api/v1/writeups' do
    it 'requires sign-in' do
      get '/api/v1/writeups'
      expect(response).to have_http_status(:unauthorized)
    end

    it "lists only the current user's unpublished write-ups, most recently updated first" do
      sign_in_as(user)
      old = create(:writeup, user: user, updated_at: 2.days.ago)
      recent = create(:writeup, user: user, title: 'Recent one', updated_at: 1.hour.ago)
      create(:writeup) # someone else's

      get '/api/v1/writeups'

      expect(json.map { |w| w['id'] }).to eq([recent.id.to_s, old.id.to_s])
    end

    it "excludes write-ups already published to the profile" do
      sign_in_as(user)
      writeup = create(:writeup, user: user)
      create(:post, user: user, writeup: writeup)

      get '/api/v1/writeups'

      expect(json).to be_empty
    end
  end

  describe 'POST /api/v1/writeups' do
    it 'creates a write-up of the given type' do
      sign_in_as(user)
      post_json '/api/v1/writeups', params: { type: 'design' }

      expect(response).to have_http_status(:created)
      expect(json['type']).to eq('design')
      expect(json['status']).to eq('proposed')
      expect(json['title']).to eq('')
    end

    it 'rejects an unknown type' do
      sign_in_as(user)
      post_json '/api/v1/writeups', params: { type: 'nope' }
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe 'GET /api/v1/writeups/:id' do
    it "forbids reading someone else's write-up" do
      sign_in_as(user)
      other = create(:writeup)
      get "/api/v1/writeups/#{other.id}"
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe 'PATCH /api/v1/writeups/:id' do
    it 'saves fields and clears a result the client omits' do
      sign_in_as(user)
      writeup = create(:writeup, user: user)
      writeup.update!(fields: writeup.fields.merge('result' => { 'label' => 'p99', 'before' => '4s', 'after' => '1s' }))

      patch_json "/api/v1/writeups/#{writeup.id}", params: {
        title: 'Checkout latency', context: 'Postgres', symptom: 'Slow', rootCause: 'Pool halved',
        fix: 'Reverted', lesson: 'Alert on waits', constraints: [], flow: [], ruledOut: [], signals: []
      }

      expect(response).to have_http_status(:ok)
      expect(json['title']).to eq('Checkout latency')
      expect(json['result']).to be_nil
    end
  end
end
