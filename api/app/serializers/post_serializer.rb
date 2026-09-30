module PostSerializer
  # Matches the `PublicPost` shape in web/src/api/types.ts.
  def self.call(post)
    history = post.revisions.map { |r| { at: r.created_at.iso8601, summary: r.summary } }
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
      publishedAt: post.published_at.iso8601,
      updatedAt: history.first&.fetch(:at),
      history: history.presence,
      hitCount: post.hit_count,
      followUps: post.follow_ups.presence
    }.compact
  end
end
