module PublicQuestionSerializer
  # Matches the `PublicQuestion` shape in web/src/api/types.ts.
  def self.call(question)
    {
      id: question.id.to_s,
      askerId: question.asker_id.to_s,
      body: question.body,
      at: question.created_at.iso8601,
      status: question.status,
      answer: question.answer_body.present? ? { body: question.answer_body, at: question.answered_at.iso8601 } : nil,
      folded: question.folded? || nil
    }.compact
  end
end
