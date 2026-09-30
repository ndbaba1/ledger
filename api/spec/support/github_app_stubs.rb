# Stubs for the GitHub App HTTP calls GithubApp makes (as opposed to
# GithubEvidenceVerifier's OAuth-client calls, already stubbed inline in the
# request specs). The JWT used to authenticate these is freshly signed and
# time-based, so we match on method + URL only, not headers.
module GithubAppStubs
  def stub_installation_found(owner, repo, installation_id: 4242)
    stub_request(:get, "https://api.github.com/repos/#{owner}/#{repo}/installation")
      .to_return(status: 200, body: { id: installation_id }.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_installation_missing(owner, repo)
    stub_request(:get, "https://api.github.com/repos/#{owner}/#{repo}/installation")
      .to_return(status: 404, body: { message: 'Not Found' }.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_installation_token(installation_id: 4242, token: 'ghs_installation_token', expires_at: 1.hour.from_now)
    stub_request(:post, "https://api.github.com/app/installations/#{installation_id}/access_tokens")
      .to_return(status: 201, body: { token: token, expires_at: expires_at.iso8601 }.to_json,
                 headers: { 'Content-Type' => 'application/json' })
  end
end

RSpec.configure do |config|
  config.include GithubAppStubs
end
