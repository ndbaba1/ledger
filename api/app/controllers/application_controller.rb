class ApplicationController < ActionController::API
  # Only needed so `form_authenticity_token` is available to the CSRF-token
  # endpoint the "Sign in with GitHub" form uses. We don't call
  # `protect_from_forgery` — JSON mutations are guarded by the Origin check
  # below instead.
  include ActionController::RequestForgeryProtection

  class Unauthorized < StandardError; end
  class Forbidden < StandardError; end
  class Unprocessable < StandardError; end

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_invalid_record
  rescue_from Unauthorized, with: :render_unauthorized
  rescue_from Forbidden, with: :render_forbidden
  rescue_from Unprocessable, with: :render_unprocessable

  before_action :verify_same_origin!

  private

  def current_user
    @current_user ||= session[:user_id].present? && User.find_by(id: session[:user_id])
  end

  def require_user!
    raise Unauthorized, 'Sign in to continue.' unless current_user
  end

  def render_not_found(error)
    render json: { error: error.message.presence || 'Not found.' }, status: :not_found
  end

  def render_unauthorized(error)
    render json: { error: error.message }, status: :unauthorized
  end

  def render_forbidden(error)
    render json: { error: error.message }, status: :forbidden
  end

  def render_unprocessable(error)
    render json: { error: error.message }, status: :unprocessable_content
  end

  def render_invalid_record(error)
    render json: { error: error.record.errors.full_messages.to_sentence }, status: :unprocessable_content
  end

  # SameSite=Lax cookies stop the session riding along with a cross-site
  # form post; this catches the rest (fetch from another origin, which still
  # sends the browser's session cookie for same-site requests otherwise).
  def verify_same_origin!
    return if request.get? || request.head?

    origin = request.headers['Origin']
    return if origin == Rails.application.config.x.app_url

    render json: { error: 'Cross-site request blocked.' }, status: :forbidden
  end
end
