module Api
  module V1
    class EvidenceController < BaseController
      before_action :require_user!
      before_action :set_writeup

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

      private

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
