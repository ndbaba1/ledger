module Api
  module V1
    class DraftsController < BaseController
      before_action :require_user!

      DAILY_CAP = 10
      # Used only when no template is given and we still need a NOT NULL
      # Writeup#type to attach verification evidence to — the job replaces it
      # (type and status together) once the real template is known.
      PLACEHOLDER_TYPE = 'incident'
      NEEDS_TEMPLATE_NOTE = 'Not enough in the source to draft from — pick a template'

      class TooManyDrafts < StandardError
        attr_reader :reset_at

        def initialize(reset_at)
          @reset_at = reset_at
          super("You've hit today's drafting limit. Try again later, or start from a template.")
        end
      end

      rescue_from GithubEvidenceVerifier::InvalidLink, GithubEvidenceVerifier::DuplicateLink, with: :render_evidence_error
      rescue_from TooManyDrafts, with: :render_too_many_drafts
      # Last-resort safety net, same as EvidenceController: every GitHub call
      # GithubEvidenceVerifier/GithubSourceContext makes is already rescued,
      # but an unanticipated Octokit error should still fail as "try again".
      rescue_from Octokit::Error, with: :render_github_error

      def create
        template = params[:template].presence
        raise Unprocessable, 'Unknown template.' if template && !Writeup::TYPES.include?(template)

        url = params[:url].to_s.strip
        parsed = GithubEvidenceVerifier.parse_url(url)
        raise Unprocessable, 'Paste a GitHub PR or issue URL.' unless parsed

        existing = in_flight_duplicate(parsed[:url])
        return render json: DraftRequestSerializer.call(existing), status: :accepted if existing

        raise TooManyDrafts, cap_reset_at if cap_reached?

        writeup = current_user.writeups.create!(type: template || PLACEHOLDER_TYPE)
        verify!(writeup, parsed[:url])
        evidence = writeup.evidence.last

        if (blocked = verification_response(writeup, evidence))
          return render(**blocked)
        end

        if evidence.private? && current_user.private_drafting_consent_at.nil?
          writeup.destroy
          return render json: { code: 'consent_required' }, status: :unprocessable_content
        end

        start_or_resolve(writeup, evidence, parsed[:url], template)
      end

      def show
        draft_request = current_user.draft_requests.find(params[:id])
        draft_request.mark_failed_if_stale!
        render json: DraftRequestSerializer.call(draft_request)
      end

      private

      def verify!(writeup, url)
        GithubEvidenceVerifier.new(writeup, url, current_user).call
      rescue GithubEvidenceVerifier::InvalidLink, GithubEvidenceVerifier::DuplicateLink
        writeup.destroy
        raise
      end

      # Returns render() kwargs when the request can't proceed from here, or
      # nil when verification earned a usable (verified) piece of evidence.
      def verification_response(writeup, evidence)
        if evidence.failure_code.present?
          payload = { error: evidence.failure_reason, failureCode: evidence.failure_code, installUrl: EvidenceSerializer.install_url_with_state(evidence) }.compact
          writeup.destroy
          { json: payload, status: :unprocessable_content }
        elsif !evidence.verified?
          payload = { error: evidence.failure_reason || 'Not verified.' }
          writeup.destroy
          { json: payload, status: :unprocessable_content }
        end
      end

      def start_or_resolve(writeup, evidence, url, template)
        source = GithubSourceContext.new(writeup, url, current_user)

        unless source.likely_empty?
          draft_request = DraftRequest.create!(
            user: current_user, writeup: writeup, source_url: url, template: template,
            status: 'drafting', drafted_from_private: evidence.private?
          )
          DraftFromSourceJob.perform_later(draft_request.id)
          return render json: DraftRequestSerializer.call(draft_request), status: :accepted
        end

        if template
          draft_request = DraftRequest.create!(
            user: current_user, writeup: writeup, source_url: url, template: template, status: 'ready',
            note: DraftRequest::EMPTY_SOURCE_NOTE, drafted_from_private: evidence.private?, counts_toward_cap: false
          )
          render json: DraftRequestSerializer.call(draft_request), status: :created
        else
          writeup.destroy
          draft_request = DraftRequest.create!(
            user: current_user, source_url: url, status: 'needs_template',
            note: NEEDS_TEMPLATE_NOTE, drafted_from_private: evidence.private?, counts_toward_cap: false
          )
          render json: DraftRequestSerializer.call(draft_request), status: :unprocessable_content
        end
      end

      def in_flight_duplicate(canonical_url)
        current_user.draft_requests.where(source_url: canonical_url, status: 'drafting').find { |dr| !dr.stale? }
      end

      def cap_scope
        current_user.draft_requests.where(counts_toward_cap: true).where(created_at: 24.hours.ago..)
      end

      def cap_reached?
        cap_scope.count >= DAILY_CAP
      end

      def cap_reset_at
        oldest = cap_scope.order(:created_at).first
        oldest ? oldest.created_at + 24.hours : 24.hours.from_now
      end

      def render_evidence_error(error)
        render json: { error: error.message }, status: :unprocessable_content
      end

      def render_too_many_drafts(error)
        render json: { error: error.message, resetAt: error.reset_at.iso8601 }, status: :too_many_requests
      end

      def render_github_error(error)
        Rails.logger.error("GitHub API error starting a draft: #{error.class}")
        render json: { error: "Couldn't check that link with GitHub. Try again." }, status: :unprocessable_content
      end
    end
  end
end
