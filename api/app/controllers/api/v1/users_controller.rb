module Api
  module V1
    class UsersController < BaseController
      def show
        user = user_by_handle!
        posts = user.posts.order(published_at: :desc)
        hit_by_viewer = current_user ? posts.select { |p| p.hit_by?(current_user) }.map(&:slug) : []

        render json: {
          user: UserSerializer.call(user),
          posts: posts.map { |p| PostSerializer.call(p) },
          projects: [],
          hitByViewer: hit_by_viewer
        }
      end
    end
  end
end
