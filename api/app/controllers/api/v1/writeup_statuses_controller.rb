module Api
  module V1
    class WriteupStatusesController < BaseController
      before_action :require_user!

      def update
        writeup = Writeup.find(params[:writeup_id])
        raise Forbidden, "That write-up isn't yours." unless writeup.user_id == current_user.id

        writeup.update!(status: params[:status])
        render json: WriteupSerializer.call(writeup)
      end
    end
  end
end
