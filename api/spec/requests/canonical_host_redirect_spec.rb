require 'rails_helper'

RSpec.describe 'CanonicalHostRedirect', type: :request do
  it 'redirects the bare www host to the canonical domain, preserving path and query' do
    host! 'www.englog.dev'
    get '/anything?foo=bar'

    expect(response).to have_http_status(:moved_permanently)
    expect(response.headers['Location']).to eq('https://englog.dev/anything?foo=bar')
  end

  it 'redirects the old Render host to the canonical domain' do
    host! 'ledger-tpul.onrender.com'
    get '/anything'

    expect(response).to have_http_status(:moved_permanently)
    expect(response.headers['Location']).to eq('https://englog.dev/anything')
  end

  it 'does not redirect the old Render host for the health check path, so Render probes keep working' do
    host! 'ledger-tpul.onrender.com'
    get '/up'

    expect(response).to have_http_status(:ok)
  end

  it 'does not redirect the canonical host itself' do
    host! 'englog.dev'
    get '/up'

    expect(response).to have_http_status(:ok)
  end
end
