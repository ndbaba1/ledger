# One row for the post page's grouped "Evidence" rail — every piece of
# evidence that earned a badge, independent of writeup type (unlike
# Evidence#badge's label, which varies by type for the flat `badges`/`evidence`
# arrays still used elsewhere). The frontend groups these by `badgeType` to
# render "Authored & merged" / "Reviewed & approved" / "Took part in".
#
# Private evidence keeps the same rule as everywhere else: no number, title,
# repo or url — only that it exists, its kind, and the month it happened.
module VerifiedEvidenceSerializer
  def self.call(evidence)
    {
      kind: evidence.kind,
      badgeType: badge_type(evidence),
      private: evidence.private? || nil,
      number: evidence.private? ? nil : evidence.number,
      title: evidence.private? ? nil : evidence.snapshot['title'],
      repo: evidence.private? ? nil : evidence.repo,
      url: evidence.private? ? nil : evidence.url,
      date: date_for(evidence)
    }.compact
  end

  def self.badge_type(evidence)
    return 'authored_merged' if evidence.kind == 'github_pr' && evidence.authored_by_user
    return 'reviewed' if evidence.kind == 'github_pr'

    'participated'
  end

  def self.date_for(evidence)
    evidence.kind == 'github_pr' ? evidence.merged_at&.iso8601 : evidence.snapshot['createdAt']
  end
end
