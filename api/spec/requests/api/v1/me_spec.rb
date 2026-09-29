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
      'headline' => 'Senior backend engineer', 'stack' => %w[go postgres],
      'links' => { 'github' => "https://github.com/#{user.github_login}" }
    )
  end
end

RSpec.describe 'PATCH /api/v1/me', type: :request do
  let(:user) { create(:user, github_login: 'octocat') }

  it 'requires sign-in' do
    patch_json '/api/v1/me', params: { name: 'New Name' }
    expect(response).to have_http_status(:unauthorized)
  end

  it 'updates name, headline, location, stack and links' do
    sign_in_as(user)

    patch_json '/api/v1/me', params: {
      name: 'Nnamdi K.', headline: 'Backend engineer', location: 'Toronto',
      stack: %w[ruby postgres], links: { website: 'https://nnamdi.example', linkedin: 'https://linkedin.com/in/nnamdi' }
    }

    expect(response).to have_http_status(:ok)
    expect(json).to include(
      'name' => 'Nnamdi K.', 'headline' => 'Backend engineer', 'location' => 'Toronto',
      'stack' => %w[ruby postgres],
      'links' => { 'github' => 'https://github.com/octocat', 'website' => 'https://nnamdi.example', 'linkedin' => 'https://linkedin.com/in/nnamdi' }
    )
  end

  it 'ignores an attempt to change the github link' do
    sign_in_as(user)
    patch_json '/api/v1/me', params: { links: { github: 'https://github.com/someone-else' } }
    expect(json['links']['github']).to eq('https://github.com/octocat')
  end

  it 'rejects more than 12 stack tags' do
    sign_in_as(user)
    patch_json '/api/v1/me', params: { stack: Array.new(13) { |i| "tag#{i}" } }
    expect(response).to have_http_status(:unprocessable_content)
  end
end
