require 'rails_helper'

RSpec.describe 'CanonicalHostRedirect', type: :request do
  before do
    @original_app_url = Rails.application.config.x.app_url
    allow(Rails.env).to receive(:production?).and_return(true)
  end

  after do
    Rails.application.config.x.app_url = @original_app_url
  end

  context 'when APP_URL points at the canonical domain' do
    before { Rails.application.config.x.app_url = 'https://englog.dev' }

    it 'redirects the bare www host to the canonical domain with a 301, preserving path and query' do
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

    it 'uses a 308 for a non-GET/HEAD request, so the method and body survive the redirect' do
      host! 'www.englog.dev'
      post '/anything'

      expect(response).to have_http_status(:permanent_redirect)
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

  context 'when APP_URL still points at the onrender.com host (before the custom domain is set up)' do
    before { Rails.application.config.x.app_url = 'https://ledger-tpul.onrender.com' }

    it 'does not redirect the onrender host, since it already matches APP_URL' do
      host! 'ledger-tpul.onrender.com'
      get '/up'

      expect(response).to have_http_status(:ok)
    end

    it 'still redirects an unrelated host to APP_URL' do
      host! 'www.englog.dev'
      get '/anything'

      expect(response).to have_http_status(:moved_permanently)
      expect(response.headers['Location']).to eq('https://ledger-tpul.onrender.com/anything')
    end
  end

  it 'does not redirect outside production, even on a mismatched host' do
    allow(Rails.env).to receive(:production?).and_return(false)
    Rails.application.config.x.app_url = 'https://englog.dev'
    host! 'www.englog.dev'
    get '/up'

    expect(response).to have_http_status(:ok)
  end
end
