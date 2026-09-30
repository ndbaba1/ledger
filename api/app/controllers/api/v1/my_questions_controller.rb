module Api
  module V1
    class MyQuestionsController < BaseController
      before_action :require_user!

      # GET /api/v1/me/questions — pending questions on my posts, oldest first.
      def index
        questions = PostQuestion
                    .joins(:post).where(posts: { user_id: current_user.id }, status: 'pending')
                    .includes(:asker, :post).order(:created_at)
        render json: questions.map { |q| MyQuestionSerializer.call(q) }
      end
    end
  end
end
