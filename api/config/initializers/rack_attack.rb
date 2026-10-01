# Basic abuse limits, checked before the request reaches a controller. Uses
# Rails.cache for counters — a single instance, so no need for anything
# shared or durable (see config/environments/production.rb).
class Rack::Attack
  self.cache.store = Rails.cache

  throttle('sign-in/ip', limit: 10, period: 1.minute) do |req|
    req.ip if req.post? && req.path.start_with?('/auth/')
  end

  throttle('ask-question/user', limit: 5, period: 1.hour) do |req|
    req.session[:user_id] if req.post? && req.path.match?(%r{\A/api/v1/users/[^/]+/posts/[^/]+/questions\z})
  end

  throttle('hit/user', limit: 30, period: 1.minute) do |req|
    req.session[:user_id] if req.post? && req.path.match?(%r{\A/api/v1/users/[^/]+/posts/[^/]+/hit\z})
  end

  throttle('evidence/user', limit: 20, period: 1.minute) do |req|
    req.session[:user_id] if req.post? && req.path.match?(%r{\A/api/v1/writeups/[^/]+/evidence\z})
  end

  # Just a burst guard — the real 10/rolling-24h cap is enforced from
  # draft_requests in the DB (DraftsController), not per IP or session.
  throttle('drafts/user', limit: 5, period: 1.minute) do |req|
    req.session[:user_id] if req.post? && req.path == '/api/v1/drafts'
  end

  throttle('req/ip', limit: 300, period: 1.minute) do |req|
    req.ip
  end

  self.throttled_responder = lambda do |req|
    [429, { 'Content-Type' => 'application/json' }, [{ error: 'Too many requests. Try again shortly.' }.to_json]]
  end
end
