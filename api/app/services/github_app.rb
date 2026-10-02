# Talks to GitHub as the Ledger GitHub App (as opposed to GithubEvidenceVerifier's
# use of a signed-in user's own OAuth token). Used only to read PRs and issues in
# repos where someone installed the app — sign-in itself stays on the OAuth app.
#
# Installations are looked up on demand via the REST API, not tracked through
# webhooks, so this works the same in development as it does anywhere else.
class GithubApp
  APP_ID = ENV.fetch('GITHUB_APP_ID', nil)
  SLUG = ENV.fetch('GITHUB_APP_SLUG', nil)
  PRIVATE_KEY_BASE64 = ENV.fetch('GITHUB_APP_PRIVATE_KEY_BASE64', nil)

  INSTALLATION_CACHE_TTL = 10.minutes
  INSTALLATION_MISS_CACHE_TTL = 1.minute
  # Installation tokens are valid for 1 hour; stop using one 5 minutes early
  # so a request never starts with a token that expires mid-flight.
  TOKEN_EXPIRY_BUFFER = 5.minutes

  class << self
    # The installation id for this repo, or nil when the app isn't installed
    # there. Cached briefly (misses for less long than hits) so adding several
    # pieces of evidence from the same repo doesn't re-ask GitHub every time.
    def installation_for(owner, repo)
      key = "github_app/installation/#{owner}/#{repo}"
      cached = Rails.cache.read(key)
      return cached == :not_installed ? nil : cached unless cached.nil?

      begin
        id = jwt_client.find_repository_installation("#{owner}/#{repo}").id
        Rails.cache.write(key, id, expires_in: INSTALLATION_CACHE_TTL)
        id
      rescue Octokit::NotFound
        Rails.cache.write(key, :not_installed, expires_in: INSTALLATION_MISS_CACHE_TTL)
        nil
      end
    end

    # An Octokit::Client authenticated as the installation, for reading PRs
    # and issues in that installation's repos.
    def installation_client(installation_id)
      key = "github_app/installation_token/#{installation_id}"
      token = Rails.cache.read(key)

      if token.nil?
        response = jwt_client.create_app_installation_access_token(installation_id)
        expires_at = response.expires_at.is_a?(String) ? Time.parse(response.expires_at) : response.expires_at
        token = response.token
        cache_until = expires_at - TOKEN_EXPIRY_BUFFER
        # If the token is already within the buffer of expiring (shouldn't
        # happen with GitHub's normal 1-hour tokens), just don't cache it —
        # the next call mints a fresh one instead of caching a negative TTL.
        Rails.cache.write(key, token, expires_at: cache_until) if cache_until > Time.current
      end

      Octokit::Client.new(bearer_token: token, auto_paginate: true)
    end

    # Where to send someone to install the app on their own account or org.
    # `owner_id` is the owner's numeric GitHub id, when we happen to know it —
    # it takes the visitor straight to that account's permission screen.
    def install_url(owner_id = nil)
      base = "https://github.com/apps/#{SLUG}/installations/new"
      owner_id ? "#{base}/permissions?target_id=#{owner_id}" : base
    end

    # Where to send someone to add a repo to an *existing* installation (an
    # installation limited to selected repos, that doesn't yet include this
    # one). Organizations and personal accounts use different settings paths.
    def installation_settings_url(installation_id, owner)
      if installation_account_type(installation_id) == 'Organization'
        "https://github.com/organizations/#{owner}/settings/installations/#{installation_id}"
      else
        "https://github.com/settings/installations/#{installation_id}"
      end
    end

    # A signed, expiring token identifying who asked to install the app, and
    # what to do once they're back — round-tripped through GitHub's
    # installation flow via the `state` query param, and verified in
    # Api::V1::Github::App::SetupsController. Pass `writeup_id` for an
    # existing write-up's evidence (returns to its editor); `draft_url` when
    # there's no write-up yet, e.g. "Start from a PR or issue" hitting the
    # same gate before one is created (returns to New write-up with the URL
    # refilled).
    def sign_setup_state(user_id:, writeup_id: nil, draft_url: nil)
      payload = { 'user_id' => user_id }
      payload['writeup_id'] = writeup_id if writeup_id
      payload['draft_url'] = draft_url if draft_url
      setup_verifier.generate(payload, expires_in: 15.minutes)
    end

    # The state payload, or nil if it's missing, tampered with, or expired.
    def verify_setup_state(state)
      setup_verifier.verify(state)
    rescue ActiveSupport::MessageVerifier::InvalidSignature
      nil
    end

    private

    def setup_verifier
      Rails.application.message_verifier('github_app_setup')
    end

    def jwt_client
      Octokit::Client.new(bearer_token: signed_jwt)
    end

    def signed_jwt
      now = Time.now.to_i
      payload = { iat: now - 60, exp: now + (9 * 60), iss: APP_ID }
      JWT.encode(payload, private_key, 'RS256')
    end

    def private_key
      @private_key ||= OpenSSL::PKey::RSA.new(Base64.decode64(PRIVATE_KEY_BASE64))
    end

    # Cached like everything else here; falls back to the personal-account
    # URL shape on any error, rather than raising out of an error path itself.
    def installation_account_type(installation_id)
      key = "github_app/installation_account_type/#{installation_id}"
      cached = Rails.cache.read(key)
      return cached if cached

      type = jwt_client.installation(installation_id).account.type
      Rails.cache.write(key, type, expires_in: INSTALLATION_CACHE_TTL)
      type
    rescue Octokit::Error
      'User'
    end
  end
end
