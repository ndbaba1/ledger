# Redirects any request whose Host doesn't match APP_URL's host to the
# canonical host (APP_URL's own scheme/host/port), preserving path and query.
# This covers the bare www host and the old Render host once APP_URL points
# at englog.dev; until then (e.g. APP_URL is still set to the onrender.com
# URL while setting up the custom domain — see README "Custom domain"),
# requests to that onrender host already match APP_URL and pass straight
# through instead of redirecting to themselves.
#
# Render's own health checker hits /up directly on whichever host it's
# configured against, so that path is always passed through unredirected —
# a redirect there could read as unhealthy.
#
# Production only: config.hosts (and therefore the set of hosts that can
# even reach this app) is unrestricted in development/test, so there's no
# single real "canonical" host to enforce there.
class CanonicalHostRedirect
  HEALTH_CHECK_PATH = '/up'.freeze
  SAFE_METHODS = %w[GET HEAD].freeze

  def initialize(app)
    @app = app
  end

  def call(env)
    return @app.call(env) unless Rails.env.production?

    request = Rack::Request.new(env)
    canonical = canonical_uri

    if canonical && request.host != canonical.host && request.path != HEALTH_CHECK_PATH
      location = build_location(canonical, request)
      # A 301 lets a client silently turn a POST into a GET on the redirect;
      # 308 preserves the method and body for anything that isn't GET/HEAD.
      status = SAFE_METHODS.include?(request.request_method) ? 301 : 308
      return [status, { 'Location' => location, 'Content-Type' => 'text/plain' }, ["Redirecting to #{location}"]]
    end

    @app.call(env)
  end

  private

  def canonical_uri
    URI.parse(Rails.application.config.x.app_url)
  rescue URI::InvalidURIError, URI::InvalidComponentError
    nil
  end

  def build_location(canonical, request)
    port = ":#{canonical.port}" unless default_port?(canonical)
    "#{canonical.scheme}://#{canonical.host}#{port}#{request.fullpath}"
  end

  def default_port?(uri)
    uri.port == (uri.scheme == 'https' ? 443 : 80)
  end
end
