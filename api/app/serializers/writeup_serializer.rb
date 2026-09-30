module WriteupSerializer
  # Matches the `Writeup` shape (WriteupFields + metadata) in web/src/api/types.ts.
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
      updatedAt: writeup.updated_at.iso8601
    }.compact
  end
end
