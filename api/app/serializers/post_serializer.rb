module PostSerializer
  # Matches the `PublicPost` shape in web/src/api/types.ts.
  def self.call(post)
    revisions = post.revisions.map { |r| { id: r.id.to_s, summary: r.summary, createdAt: r.created_at.iso8601 } }
    follow_ups = post.follow_ups.map { |f| { question: f['question'], answer: f['answer'], askerId: f['asker_id'] }.compact }
    # Failed evidence (private, deleted, unreachable) never appears publicly.
    # What's left splits in two: verified evidence renders grouped by badge
    # type in the rail (see VerifiedEvidenceSerializer); everything else
    # (plain links, a fetched PR/issue that just didn't earn a badge) keeps
    # its own flat row, same as always.
    live_evidence = post.writeup.evidence.reject { |e| e.status == 'failed' }
    verified_evidence = live_evidence.select(&:verified?).map { |e| VerifiedEvidenceSerializer.call(e) }
    evidence = live_evidence.reject(&:verified?).map { |e| { label: e.title, verified: false, url: e.url } }
    {
      slug: post.slug,
      writeupId: post.writeup_id.to_s,
      authorId: post.user_id.to_s,
      type: post.type,
      title: post.title,
      tags: post.tags,
      summary: post.summary,
      context: post.context,
      decision: post.decision,
      sections: post.sections,
      result: post.result,
      lesson: post.lesson,
      badges: post.badges,
      # Always present (even empty) on a live post — unlike a mock post, which
      # never sets either — so the frontend can tell them apart and render
      # accordingly (see groupVerifiedEvidence in web/src/lib/publicPost.ts).
      evidence: evidence,
      verifiedEvidence: verified_evidence,
      publishedAt: post.published_at.iso8601,
      revisions: revisions.presence,
      hitCount: post.hit_count,
      followUps: follow_ups.presence
    }.compact
  end
end
