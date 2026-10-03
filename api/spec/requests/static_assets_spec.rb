require 'rails_helper'

RSpec.describe 'Brand assets and manifest', type: :request do
  it 'serves the favicon, the og image and the web manifest' do
    get '/brand/favicon.svg'
    expect(response).to have_http_status(:ok)

    get '/brand/og-image.png'
    expect(response).to have_http_status(:ok)

    get '/site.webmanifest'
    expect(response).to have_http_status(:ok)
  end
end
