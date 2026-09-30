module EvidenceSerializer
  # Matches the `Source` shape in web/src/api/types.ts.
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
      failureReason: evidence.failure_reason.presence,
      refreshWarning: evidence.refresh_warning.presence
    }.compact
  end
end
