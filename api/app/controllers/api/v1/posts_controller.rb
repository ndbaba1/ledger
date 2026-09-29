module Api
  module V1
    class PostsController < BaseController
      def show
        user = user_by_handle!(params[:user_handle])
        post = post_by_slug!(user)
        render json: { post: PostSerializer.call(post), author: UserSerializer.call(user) }
      end
    end
  end
end
