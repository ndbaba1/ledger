module Api
  module V1
    class PostThreadsController < BaseController
      def show
        post = post_by_slug!(user_by_handle!(params[:user_handle]), params[:post_slug])
        render json: thread_json(post)
      end
    end
  end
end
