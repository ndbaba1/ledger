module Api
  module V1
    class EvidenceController < BaseController
      before_action :require_user!
      before_action :set_writeup

      rescue_from GithubEvidenceVerifier::InvalidLink, GithubEvidenceVerifier::DuplicateLink, with: :render_evidence_error
      # Last-resort safety net: GithubEvidenceVerifier rescues every GitHub
      # call it makes, but an unanticipated Octokit error (a new status code,
      # a bug in a fallback path) should still fail as "try again", not 500.
      rescue_from Octokit::Error, with: :render_github_error

      def create
        url = params[:url].to_s.strip
        raise Unprocessable, "That doesn't look like a link. Paste a full https:// URL." unless parseable_url?(url)

        GithubEvidenceVerifier.new(@writeup, url, current_user).call
        render json: WriteupSerializer.call(@writeup.reload), status: :created
      end

      def destroy
        evidence = @writeup.evidence.find_by(key: params[:key])
        evidence&.destroy
        render json: WriteupSerializer.call(@writeup.reload)
      end

      # Re-runs the verifier for one piece of evidence in place — used after
      # installing the GitHub App, or just to try again, without re-pasting
      # the URL (which would otherwise bounce off DuplicateLink).
      def recheck
        evidence = @writeup.evidence.find_by!(key: params[:key])
        GithubEvidenceVerifier.refresh(evidence, current_user)
        render json: WriteupSerializer.call(@writeup.reload)
      end

      private

      def render_evidence_error(error)
        render json: { error: error.message }, status: :unprocessable_content
      end

      def render_github_error(error)
        Rails.logger.error("GitHub API error verifying evidence: #{error.class}: #{error.message}")
        render json: { error: "Couldn't check that link with GitHub. Try again." }, status: :unprocessable_content
      end

      def set_writeup
        @writeup = Writeup.find(params[:writeup_id])
        raise Forbidden, "That write-up isn't yours." unless @writeup.user_id == current_user.id
      end

      # Just enough of a gate to reject garbage strings before anything else
      # touches them. The scheme itself (http/https only) is the Evidence
      # model's job, since it has to hold for every path into that model.
      def parseable_url?(url)
        return false if url.blank?

        URI.parse(url)
        true
      rescue URI::InvalidURIError
        false
      end
    end
  end
end
