module Api
  module V1
    class WriteupPublicationsController < BaseController
      before_action :require_user!

      def create
        writeup = Writeup.find(params[:writeup_id])
        raise Forbidden, "That write-up isn't yours." unless writeup.user_id == current_user.id

        missing = writeup.publish_blockers
        raise Unprocessable, "Not ready to publish. Still needed: #{missing.join(', ')}." if missing.any?

        if writeup.published?
          republish(writeup)
        else
          post = PostBuilder.call(writeup)
          post.save!
          render json: PostSerializer.call(post), status: :created
        end
      end

      private

      def republish(writeup)
        summary = params[:summary].to_s.strip
        raise Unprocessable, 'Say what changed (up to 140 characters).' if summary.blank?
        raise Unprocessable, 'Keep the change summary under 140 characters.' if summary.length > 140

        post = writeup.post
        previous_sections = post.sections
        dropped = refresh_evidence!(writeup)

        PostBuilder.apply(post, writeup)
        post.save!
        post.revisions.create!(summary: summary, sections_snapshot: previous_sections)

        payload = PostSerializer.call(post)
        payload[:droppedBadges] = dropped if dropped.any?
        render json: payload
      end

      # Re-verifies each attached PR/issue against GitHub's current state.
      # Returns the titles of any evidence that lost its badge in the process
      # — publishing still goes ahead, the author is just told about them.
      def refresh_evidence!(writeup)
        dropped = []
        writeup.evidence.where(kind: %w[github_pr github_issue]).find_each do |evidence|
          had_badge = evidence.badge(writeup.type).present?
          GithubEvidenceVerifier.refresh(evidence, current_user)
          had_badge_and_lost_it = had_badge && evidence.reload.badge(writeup.type).blank?
          dropped << evidence.title if had_badge_and_lost_it
        end
        # `writeup.evidence` may already be cached (e.g. from `publish_blockers`
        # above) with the pre-refresh rows — drop that cache so PostBuilder
        # recomputes badges from what we just wrote to the database.
        writeup.evidence.reset
        dropped
      end
    end
  end
end
