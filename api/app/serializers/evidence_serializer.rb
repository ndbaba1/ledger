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
      failureReason: evidence.failure_reason.presence
    }.compact
  end
end
