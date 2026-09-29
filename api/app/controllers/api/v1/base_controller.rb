module Api
  module V1
    class BaseController < ApplicationController
      private

      def user_by_handle!(handle = params[:handle])
        User.find_by(handle: handle) || (raise ActiveRecord::RecordNotFound, "@#{handle} not found")
      end

      def post_by_slug!(user, slug = params[:slug])
        user.posts.find_by(slug: slug) || (raise ActiveRecord::RecordNotFound, 'Post not found')
      end

      # Public Q&A is out of scope for v1: no questions or askers yet.
      def thread_json(post)
        {
          questions: [],
          askers: [],
          mine: [],
          hitCount: post.hit_count,
          hitByMe: current_user.present? && post.hit_by?(current_user)
        }
      end
    end
  end
end
