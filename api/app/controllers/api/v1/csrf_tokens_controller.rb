module Api
  module V1
    # Lets the frontend put a valid Rails CSRF token in the hidden form it
    # posts to /auth/github, satisfying omniauth-rails_csrf_protection.
    class CsrfTokensController < BaseController
      def show
        render json: { csrfToken: form_authenticity_token }
      end
    end
  end
end
