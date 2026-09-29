module Api
  module V1
    class ExploreController < BaseController
      def index
        scope = Post.all
        scope = scope.where(type: params[:type]) if params[:type].present?
        scope = scope.where('? = ANY(tags)', params[:tag]) if params[:tag].present?
        scope = params[:query].present? ? scope.search(params[:query]) : scope.order(published_at: :desc)

        render json: {
          items: scope.includes(:user).map { |p| FeedItemSerializer.call(p, viewer: current_user) },
          tags: top_tags,
          total: Post.count
        }
      end

      private

      def top_tags
        Post.pluck(:tags).flatten.tally
          .sort_by { |tag, count| [-count, tag] }
          .first(12)
          .map { |tag, count| { tag: tag, count: count } }
      end
    end
  end
end
