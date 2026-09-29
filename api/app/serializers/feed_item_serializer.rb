module FeedItemSerializer
  # Matches the `FeedItem` shape in web/src/api/types.ts.
  def self.call(post, viewer:)
    {
      post: PostSerializer.call(post),
      author: UserSerializer.call(post.user),
      hitByMe: viewer.present? && post.hit_by?(viewer)
    }
  end
end
