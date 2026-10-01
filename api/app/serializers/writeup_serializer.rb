module WriteupSerializer
  # Matches the `Writeup` shape (WriteupFields + metadata) in web/src/api/types.ts.
  #
  # draftedFrom (including the source URL, repo privacy and per-section
  # source labels) is author-only: this serializer is only ever rendered to
  # the write-up's own author (see WriteupsController#owned_writeup!) and
  # must never be reused for a public post — PostSerializer/PostBuilder don't
  # read any draft_* column, and must stay that way.
  def self.call(writeup)
    fields = writeup.fields || {}
    {
      id: writeup.id.to_s,
      type: writeup.type,
      status: writeup.status,
      title: writeup.title,
      context: fields['context'] || '',
      symptom: fields['symptom'] || '',
      constraints: fields['constraints'] || [],
      rootCause: fields['rootCause'] || '',
      flow: fields['flow'] || [],
      ruledOut: fields['ruledOut'] || [],
      fix: fields['fix'] || '',
      lesson: fields['lesson'] || '',
      result: fields['result'],
      signals: fields['signals'] || [],
      evidence: writeup.evidence.map { |e| EvidenceSerializer.call(e) },
      postSlug: writeup.post&.slug,
      authorId: writeup.user_id.to_s,
      createdAt: writeup.created_at.iso8601,
      updatedAt: writeup.updated_at.iso8601,
      draftedFrom: drafted_from(writeup)
    }.compact
  end

  def self.drafted_from(writeup)
    return nil if writeup.draft_source_url.blank?

    {
      sourceUrl: writeup.draft_source_url,
      model: writeup.draft_model,
      promptVersion: writeup.draft_prompt_version,
      draftedAt: writeup.drafted_at&.iso8601,
      private: writeup.drafted_from_private,
      sections: writeup.draft_sections_meta
    }.compact
  end
end
