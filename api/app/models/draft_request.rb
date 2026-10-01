class DraftRequest < ApplicationRecord
  # needs_template: no writeup was created — the source had nothing to draft
  # from and no template was given, so the frontend asks the user to pick one
  # and resubmits. Every other status always has (or once had) a writeup.
  STATUSES = %w[drafting ready failed needs_template].freeze

  # A request still "drafting" past this age was almost certainly orphaned by
  # a deploy killing the Puma process mid-job (jobs run in Puma itself — see
  # api/config/puma.rb) rather than one that's just slow.
  STALE_AFTER = 3.minutes
  INTERRUPTED_MESSAGE = 'Drafting was interrupted — try again'.freeze
  # Used both by DraftsController (empty source, template given — resolved
  # synchronously, no job) and DraftFromSourceJob (empty source discovered
  # only after the full context build, no template given — rare, since the
  # controller's cheaper check usually catches this first).
  EMPTY_SOURCE_NOTE = 'Not enough in the source to draft from'.freeze

  belongs_to :user
  belongs_to :writeup, optional: true

  validates :status, inclusion: { in: STATUSES }
  validates :source_url, presence: true

  def stale?
    status == 'drafting' && created_at < STALE_AFTER.ago
  end

  # Called from GET /drafts/:id and from the job's own start — either one may
  # be the first to notice a request has been stuck past STALE_AFTER.
  def mark_failed_if_stale!
    return false unless stale?

    update!(status: 'failed', error: INTERRUPTED_MESSAGE, counts_toward_cap: false)
    true
  end
end
