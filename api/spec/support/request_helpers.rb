module RequestHelpers
  # All non-GET JSON requests need a matching Origin header (see
  # ApplicationController#verify_same_origin!) and a JSON content type.
  def json_headers(extra = {})
    { 'CONTENT_TYPE' => 'application/json', 'Origin' => Rails.application.config.x.app_url }.merge(extra)
  end

  def post_json(path, params: {}, headers: {})
    post path, params: params.to_json, headers: json_headers(headers)
  end

  def patch_json(path, params: {}, headers: {})
    patch path, params: params.to_json, headers: json_headers(headers)
  end

  def delete_json(path, headers: {})
    delete path, headers: json_headers(headers)
  end

  # A test-only route (see config/routes.rb) sets the session cookie the
  # same way the real GitHub callback does, without needing a live OAuth flow.
  def sign_in_as(user)
    post_json('/test/sign_in', params: { user_id: user.id })
  end

  def json
    JSON.parse(response.body)
  end
end

RSpec.configure do |config|
  config.include RequestHelpers, type: :request
end
