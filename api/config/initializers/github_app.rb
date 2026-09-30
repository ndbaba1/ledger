# GithubApp signs requests with GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_BASE64
# (see .env.example, and README for how to register the app); development and
# test fall back to a fixed, throwaway app id and RSA key so the app boots —
# and the test suite can sign JWTs — without a real GitHub App registered.
unless ENV['GITHUB_APP_PRIVATE_KEY_BASE64'].present?
  ENV['GITHUB_APP_ID'] ||= '999999'
  ENV['GITHUB_APP_SLUG'] ||= 'ledger-dev'
  ENV['GITHUB_APP_PRIVATE_KEY_BASE64'] = Base64.strict_encode64(OpenSSL::PKey::RSA.new(2048).to_pem)
end
