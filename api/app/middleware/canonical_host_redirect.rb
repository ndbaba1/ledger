# 301s the bare www and the old Render host to the canonical production
# domain, preserving path and query. Render's own health checker hits the old
# onrender host's /up directly, so that path is left alone — a redirect there
# could read as unhealthy and the "keep the onrender host" intent is to let
# it keep answering, not to send it away too.
class CanonicalHostRedirect
  REDIRECT_HOSTS = %w[www.englog.dev ledger-tpul.onrender.com].freeze
  CANONICAL_HOST = 'englog.dev'.freeze
  HEALTH_CHECK_PATH = '/up'.freeze

  def initialize(app)
    @app = app
  end

  def call(env)
    request = Rack::Request.new(env)

    if REDIRECT_HOSTS.include?(request.host) && request.path != HEALTH_CHECK_PATH
      location = "https://#{CANONICAL_HOST}#{request.fullpath}"
      return [301, { 'Location' => location, 'Content-Type' => 'text/plain' }, ["Redirecting to #{location}"]]
    end

    @app.call(env)
  end
end
