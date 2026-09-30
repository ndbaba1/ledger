# Only reports errors when SENTRY_DSN is set (unset in development/test, and
# on Render until it's configured). Never send request bodies or auth data —
# GitHub tokens and session cookies have no business leaving this process.
if ENV['SENTRY_DSN'].present?
  Sentry.init do |config|
    config.dsn = ENV['SENTRY_DSN']
    config.send_default_pii = false
    config.send_client_reports = false
    config.breadcrumbs_logger = []
  end
end
