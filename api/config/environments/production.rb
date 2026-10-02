require "active_support/core_ext/integer/time"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Cache assets for far-future expiry since they are all digest stamped.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Render terminates TLS in front of us and forwards plain HTTP, so tell
  # Rails to treat every request as already secure and to enforce that.
  # DISABLE_FORCE_SSL=1 is only for smoke-testing the production image over
  # plain HTTP on a laptop — it must never be set on Render.
  unless ENV['DISABLE_FORCE_SSL']
    config.assume_ssl = true
    config.force_ssl = true

    # Skip http-to-https redirect for the default health check endpoint.
    config.ssl_options = { redirect: { exclude: ->(request) { request.path == "/up" } } }
  end

  # Render's edge proxy connects to us from an internal, private-network
  # address, which Rails' default trusted proxy list already covers — this
  # just makes explicit that request.ip is trusted to come from
  # X-Forwarded-For rather than the socket peer.
  config.action_dispatch.trusted_proxies = ActionDispatch::RemoteIp::TRUSTED_PROXIES

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # A single instance for now, so Rack::Attack's counters (and GithubApp's
  # installation-lookup cache) don't need to be shared or durable — an
  # in-process memory store is fine and skips Solid Cache's extra database.
  config.cache_store = :memory_store, { size: 64.megabytes }

  # Replace the default in-process and non-durable queuing backend for Active Job.
  # No connects_to here — Solid Queue uses the primary connection, same as
  # development and test (see config/database.yml and
  # db/migrate/20261002000001_create_solid_queue_tables.rb).
  config.active_job.queue_adapter = :solid_queue

  # Ignore bad email addresses and do not raise email delivery errors.
  # Set this to true and configure the email server for immediate delivery to raise delivery errors.
  # config.action_mailer.raise_delivery_errors = false

  # Set host to be used by links generated in mailer templates.
  config.action_mailer.default_url_options = { host: "example.com" }

  # Specify outgoing SMTP server. Remember to add smtp/* credentials via bin/rails credentials:edit.
  # config.action_mailer.smtp_settings = {
  #   user_name: Rails.application.credentials.dig(:smtp, :user_name),
  #   password: Rails.application.credentials.dig(:smtp, :password),
  #   address: "smtp.example.com",
  #   port: 587,
  #   authentication: :plain
  # }

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # Enable DNS rebinding protection and other `Host` header attacks. The
  # onrender host stays allowed (not removed) so Render's health check keeps
  # working; CanonicalHostRedirect (see config/initializers) 301s it and the
  # bare www to the canonical domain for everything except /up.
  config.hosts = [
    "englog.dev",
    "www.englog.dev",
    "ledger-tpul.onrender.com"
  ]

  # Skip DNS rebinding protection for the default health check endpoint.
  config.host_authorization = { exclude: ->(request) { request.path == "/up" } }
end
