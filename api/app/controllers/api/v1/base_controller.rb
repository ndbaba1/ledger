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

      # Readers see answered questions; the author also sees pending ones to act on.
      def thread_json(post)
        is_author = current_user.present? && post.user_id == current_user.id
        questions = (is_author ? post.questions.where(status: %w[pending answered]) : post.questions.answered).order(:created_at).to_a
        mine = (!is_author && current_user) ? post.questions.pending.where(asker_id: current_user.id).order(:created_at).to_a : []

        asker_ids = (questions.map(&:asker_id) + mine.map(&:asker_id)).uniq
        askers_by_id = User.where(id: asker_ids).index_by(&:id)

        {
          questions: questions.map { |q| PublicQuestionSerializer.call(q) },
          askers: asker_ids.map { |id| UserSerializer.call(askers_by_id.fetch(id)) },
          mine: mine.map { |q| PublicQuestionSerializer.call(q) },
          hitCount: post.hit_count,
          hitByMe: current_user.present? && post.hit_by?(current_user)
        }
      end
    end
  end
end
