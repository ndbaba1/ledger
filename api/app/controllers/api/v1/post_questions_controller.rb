module Api
  module V1
    class PostQuestionsController < BaseController
      before_action :require_user!

      # POST .../questions — askPublic
      def create
        post = post_by_slug!(user_by_handle!(params[:user_handle]), params[:post_slug])
        raise Forbidden, "You can't ask a question on your own post." if post.user_id == current_user.id

        body = params[:body].to_s.strip
        raise Unprocessable, 'Write a question first.' if body.blank?
        raise Unprocessable, 'Keep questions under 600 characters.' if body.length > PostQuestion::MAX_BODY_LENGTH

        if current_user.post_questions.where(created_at: 1.hour.ago..).count >= PostQuestion::MAX_PER_ASKER_PER_HOUR
          raise Unprocessable, "You've asked a few questions already — try again in a bit."
        end
        if post.questions.pending.count >= PostQuestion::MAX_PENDING_PER_POST
          raise Unprocessable, 'This post already has a few questions waiting on an answer.'
        end

        post.questions.create!(asker: current_user, body: body, status: 'pending')
        render json: thread_json(post)
      end

      # POST .../questions/:id/answer — author only
      def answer
        question = authors_question!
        body = params[:body].to_s.strip
        raise Unprocessable, 'Write an answer first.' if body.blank?

        question.update!(status: 'answered', answer_body: body, answered_at: Time.current)
        render json: thread_json(question.post)
      end

      # POST .../questions/:id/dismiss — author only; the asker isn't told.
      def dismiss
        question = authors_question!
        question.update!(status: 'dismissed')
        render json: thread_json(question.post)
      end

      # POST .../questions/:id/fold — author only, answered questions only.
      def fold
        question = authors_question!
        raise Unprocessable, 'Answer the question before folding it in.' unless question.answered?

        post = question.post
        unless question.folded?
          question.update!(folded: true)
          post.update!(follow_ups: post.follow_ups + [{ 'question' => question.body, 'answer' => question.answer_body }])
          post.revisions.create!(summary: "Added a follow-up: #{question.body[0, 60]}", sections_snapshot: post.sections)
        end

        render json: { thread: thread_json(post), post: PostSerializer.call(post) }
      end

      private

      def authors_question!
        post = post_by_slug!(user_by_handle!(params[:user_handle]), params[:post_slug])
        raise Forbidden, 'Only the author can do that.' unless post.user_id == current_user.id

        post.questions.find(params[:id])
      end
    end
  end
end
