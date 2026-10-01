require 'rails_helper'

RSpec.describe 'Private drafting consent API', type: :request do
  let(:user) { create(:user) }

  describe 'POST /api/v1/me/private_drafting_consent' do
    it 'records a server-set timestamp, ignoring any client-supplied value' do
      sign_in_as(user)
      post_json '/api/v1/me/private_drafting_consent', params: { privateDraftingConsentAt: '2000-01-01T00:00:00Z' }

      expect(response).to have_http_status(:no_content)
      expect(user.reload.private_drafting_consent_at).to be_within(5.seconds).of(Time.current)
    end

    it 'requires sign-in' do
      post '/api/v1/me/private_drafting_consent', headers: json_headers
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe 'DELETE /api/v1/me/private_drafting_consent' do
    it 'withdraws consent, after which private sources require it again' do
      sign_in_as(user)
      user.update!(private_drafting_consent_at: Time.current)

      delete_json '/api/v1/me/private_drafting_consent'

      expect(response).to have_http_status(:no_content)
      expect(user.reload.private_drafting_consent_at).to be_nil
    end
  end
end
