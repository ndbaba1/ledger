module Api
  module V1
    class MeController < BaseController
      def show
        require_user!
        render json: UserSerializer.call(current_user)
      end
    end
  end
end
