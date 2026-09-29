module PostSerializer
  # Matches the `PublicPost` shape in web/src/api/types.ts.
  def self.call(post)
    {
      slug: post.slug,
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
      hitCount: post.hit_count,
      followUps: post.follow_ups.presence
    }.compact
  end
end
