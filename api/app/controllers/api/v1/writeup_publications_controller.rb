module Api
  module V1
    class WriteupPublicationsController < BaseController
      before_action :require_user!

      def create
        writeup = Writeup.find(params[:writeup_id])
        raise Forbidden, "That write-up isn't yours." unless writeup.user_id == current_user.id

        return render json: PostSerializer.call(writeup.post) if writeup.published?

        missing = writeup.publish_blockers
        raise Unprocessable, "Not ready to publish. Still needed: #{missing.join(', ')}." if missing.any?

        post = PostBuilder.call(writeup)
        post.save!
        render json: PostSerializer.call(post), status: :created
      end
    end
  end
end
