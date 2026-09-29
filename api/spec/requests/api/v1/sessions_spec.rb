require 'rails_helper'

RSpec.describe 'DELETE /api/v1/session', type: :request do
  it 'signs the user out' do
    user = create(:user)
    sign_in_as(user)

    delete_json '/api/v1/session'
    expect(response).to have_http_status(:no_content)

    get '/api/v1/me'
    expect(response).to have_http_status(:unauthorized)
  end

  it 'rejects a cross-site request' do
    user = create(:user)
    sign_in_as(user)

    delete '/api/v1/session', headers: { 'Origin' => 'https://evil.example' }
    expect(response).to have_http_status(:forbidden)
  end
end
