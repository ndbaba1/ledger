require 'rails_helper'

RSpec.describe 'GET /api/v1/users/:handle', type: :request do
  it 'returns the profile with posts, empty projects, and the viewer’s hits' do
    author = create(:user, handle: 'hannahl', name: 'Hannah L.')
    post = create(:post, user: author, title: 'Retries turned a blip into an outage')
    reader = create(:user)
    create(:hit, user: reader, post: post)
    sign_in_as(reader)

    get '/api/v1/users/hannahl'

    expect(response).to have_http_status(:ok)
    expect(json['user']['handle']).to eq('hannahl')
    expect(json['posts'].map { |p| p['title'] }).to eq(['Retries turned a blip into an outage'])
    expect(json['projects']).to eq([])
    expect(json['hitByViewer']).to eq([post.slug])
  end

  it "404s for a handle that doesn't exist" do
    get '/api/v1/users/nobody'
    expect(response).to have_http_status(:not_found)
  end
end
