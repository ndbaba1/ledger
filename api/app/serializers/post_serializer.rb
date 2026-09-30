module PostSerializer
  # Matches the `PublicPost` shape in web/src/api/types.ts.
  def self.call(post)
    revisions = post.revisions.map { |r| { id: r.id.to_s, summary: r.summary, createdAt: r.created_at.iso8601 } }
    follow_ups = post.follow_ups.map { |f| { question: f['question'], answer: f['answer'] }.compact }
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
      revisions: revisions.presence,
      hitCount: post.hit_count,
      followUps: follow_ups.presence
    }.compact
  end
end
