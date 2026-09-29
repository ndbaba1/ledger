module Api
  module V1
    class UsersController < BaseController
      def show
        user = user_by_handle!
        posts = user.posts.order(published_at: :desc)
        hit_by_viewer = current_user ? posts.select { |p| p.hit_by?(current_user) }.map(&:slug) : []
        verified_prs = Evidence.verified_pull_requests_for(user)

        render json: {
          user: UserSerializer.call(user),
          posts: posts.map { |p| PostSerializer.call(p) },
          projects: [],
          hitByViewer: hit_by_viewer,
          verifiedPRs: verified_prs.size,
          repos: verified_prs.map(&:repo).uniq.compact.size
        }
      end
    end
  end
end
