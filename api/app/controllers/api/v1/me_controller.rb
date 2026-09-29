module Api
  module V1
    class MeController < BaseController
      before_action :require_user!

      def show
        render json: UserSerializer.call(current_user)
      end

      def update
        permitted = params.permit(:name, :headline, :location, stack: [], links: %i[website linkedin]).to_h
        links = permitted.delete('links') || {}
        attrs = permitted.merge(links.slice('website', 'linkedin'))

        current_user.update!(attrs)
        render json: UserSerializer.call(current_user)
      end
    end
  end
end
