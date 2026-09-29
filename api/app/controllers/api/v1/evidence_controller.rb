module Api
  module V1
    class EvidenceController < BaseController
      before_action :require_user!
      before_action :set_writeup

      def create
        url = params[:url].to_s.strip
        raise Unprocessable, "That doesn't look like a link. Paste a full https:// URL." unless valid_url?(url)
        raise Unprocessable, 'That link is already attached.' if @writeup.evidence.exists?(url: url)

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

      def valid_url?(url)
        uri = URI.parse(url)
        uri.is_a?(URI::HTTP) && uri.host.present?
      rescue URI::InvalidURIError
        false
      end
    end
  end
end
