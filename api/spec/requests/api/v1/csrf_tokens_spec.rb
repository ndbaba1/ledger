require 'rails_helper'

RSpec.describe 'GET /api/v1/csrf_token', type: :request do
  it 'returns a token the sign-in form can submit' do
    get '/api/v1/csrf_token'
    expect(response).to have_http_status(:ok)
    expect(json['csrfToken']).to be_present
  end
end
