Rails.application.config.middleware.use OmniAuth::Builder do
  provider :github, ENV.fetch('GITHUB_CLIENT_ID', nil), ENV.fetch('GITHUB_CLIENT_SECRET', nil),
           scope: 'read:user'
end

OmniAuth.config.logger = Rails.logger
# Pin the callback to APP_URL rather than deriving it from the request's Host
# header — behind a proxy that header can arrive without its port (nginx's
# $host drops it), which would send GitHub to the wrong redirect_uri.
OmniAuth.config.full_host = Rails.application.config.x.app_url
# The frontend submits a real <form method="post"> (see /api/v1/csrf_token),
# so the default POST-only request phase (CVE-2015-9284 mitigation) applies.
OmniAuth.config.on_failure = proc { |env| SessionsController.action(:failure).call(env) }
