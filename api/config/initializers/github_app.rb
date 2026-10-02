# GithubApp signs requests with GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_BASE64
# (see .env.example, and README for how to register the app); development and
# test fall back to a fixed, throwaway app id and RSA key so the app boots —
# and the test suite can sign JWTs — without a real GitHub App registered.
if Rails.env.production?
  key_base64 = ENV['GITHUB_APP_PRIVATE_KEY_BASE64']
  raise 'GITHUB_APP_PRIVATE_KEY_BASE64 is missing. Set it to the base64-encoded ' \
        'private key of the GitHub App (see README "Deploying").' if key_base64.blank?

  begin
    OpenSSL::PKey::RSA.new(Base64.strict_decode64(key_base64))
  rescue ArgumentError, OpenSSL::PKey::RSAError => e
    raise "GITHUB_APP_PRIVATE_KEY_BASE64 isn't a valid base64-encoded RSA private key: #{e.message}"
  end
elsif ENV['GITHUB_APP_PRIVATE_KEY_BASE64'].blank?
  ENV['GITHUB_APP_ID'] ||= '999999'
  ENV['GITHUB_APP_SLUG'] ||= 'englog-dev'
  ENV['GITHUB_APP_PRIVATE_KEY_BASE64'] = Base64.strict_encode64(OpenSSL::PKey::RSA.new(2048).to_pem)
end
