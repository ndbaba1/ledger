# Handles the OmniAuth GitHub callback (GET /auth/github/callback) and
# failure redirect. The request phase itself (POST /auth/github) never
# reaches here — the OmniAuth middleware handles it directly.
class SessionsController < ApplicationController
  def create
    user = User.from_github(request.env['omniauth.auth'])
    session[:user_id] = user.id
    redirect_to Rails.application.config.x.app_url, allow_other_host: true
  end

  def failure
    redirect_to Rails.application.config.x.app_url, allow_other_host: true
  end
end
