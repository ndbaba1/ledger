module Api
  module V1
    class PostHitsController < BaseController
      before_action :require_user!

      def create
        post = post_by_slug!(user_by_handle!(params[:user_handle]), params[:post_slug])
        raise Forbidden, 'You wrote this one.' if post.user_id == current_user.id

        existing = post.hits.find_by(user: current_user)
        if existing
          existing.destroy
          post.update!(hit_count: [post.hit_count - 1, 0].max)
        else
          post.hits.create!(user: current_user)
          post.update!(hit_count: post.hit_count + 1)
        end

        render json: thread_json(post)
      end
    end
  end
end
