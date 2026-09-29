require 'rails_helper'

RSpec.describe 'GET /api/v1/me', type: :request do
  it 'returns 401 when signed out' do
    get '/api/v1/me'
    expect(response).to have_http_status(:unauthorized)
    expect(json['error']).to be_present
  end

  it "returns the signed-in user's public shape" do
    user = create(:user, headline: 'Senior backend engineer', stack: %w[go postgres])
    sign_in_as(user)

    get '/api/v1/me'

    expect(response).to have_http_status(:ok)
    expect(json).to eq(
      'id' => user.id.to_s, 'name' => user.name, 'handle' => user.handle,
      'initials' => user.initials, 'avatarHue' => user.avatar_hue,
      'headline' => 'Senior backend engineer', 'stack' => %w[go postgres]
    )
  end
end
