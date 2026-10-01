module DraftRequestSerializer
  def self.call(draft_request)
    {
      draftId: draft_request.id.to_s,
      status: draft_request.status,
      error: draft_request.error,
      note: draft_request.note,
      writeupId: draft_request.writeup_id&.to_s
    }.compact
  end
end
