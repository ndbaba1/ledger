module MyQuestionSerializer
  # Matches the `PendingQuestion` shape in web/src/api/types.ts.
  def self.call(question)
    {
      id: question.id.to_s,
      body: question.body,
      at: question.created_at.iso8601,
      asker: UserSerializer.call(question.asker),
      post: { slug: question.post.slug, title: question.post.title }
    }
  end
end
