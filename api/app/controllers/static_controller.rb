# Serves the built frontend (web/dist, copied into public/ at image build
# time) for any path the API and auth routes don't claim. See config/routes.rb.
class StaticController < ActionController::API
  def index
    send_file Rails.public_path.join('index.html'), type: 'text/html', disposition: 'inline'
  end
end
