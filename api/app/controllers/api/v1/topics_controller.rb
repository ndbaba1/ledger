module Api
  module V1
    class TopicsController < BaseController
      def show
        tag = params[:tag].to_s.downcase
        posts = Post.where('? = ANY(tags)', tag).includes(:user).order(hit_count: :desc, published_at: :desc).to_a
        raise ActiveRecord::RecordNotFound, "Topic “#{tag}” not found" if posts.empty?

        render json: {
          tag: tag,
          items: posts.map { |p| FeedItemSerializer.call(p, viewer: current_user) },
          related: related_tags(posts, tag),
          totalHits: posts.sum(&:hit_count)
        }
      end

      private

      def related_tags(posts, tag)
        counts = Hash.new(0)
        posts.each { |p| p.tags.each { |t| counts[t] += 1 unless t == tag } }
        counts.sort_by { |t, c| [-c, t] }.first(8).map { |t, c| { tag: t, count: c } }
      end
    end
  end
end
