module EvidenceSerializer
  # Matches the `Source` shape in web/src/api/types.ts. Only ever rendered to
  # the write-up's own author (see WriteupsController#owned_writeup!), so a
  # private repo's real title, owner and install_url are safe to include here
  # — none of them reach PostSerializer's public JSON.
  def self.call(evidence)
    {
      key: evidence.key,
      kind: evidence.kind,
      title: evidence.title,
      detail: evidence.detail,
      status: evidence.status,
      url: evidence.url,
      hops: 0,
      authoredByMe: evidence.authored_by_user,
      verified: evidence.verified?,
      private: evidence.private? || nil,
      owner: evidence.owner,
      failureCode: evidence.failure_code,
      failureReason: evidence.failure_reason.presence,
      refreshWarning: evidence.refresh_warning.presence,
      installUrl: install_url_with_state(evidence)
    }.compact
  end

  def self.install_url_with_state(evidence)
    return nil if evidence.install_url.blank?

    state = GithubApp.sign_setup_state(user_id: evidence.writeup.user_id, writeup_id: evidence.writeup_id)
    separator = evidence.install_url.include?('?') ? '&' : '?'
    "#{evidence.install_url}#{separator}state=#{CGI.escape(state)}"
  end
end
