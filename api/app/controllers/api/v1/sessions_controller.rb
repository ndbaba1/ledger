module Api
  module V1
    class SessionsController < BaseController
      def destroy
        reset_session
        head :no_content
      end
    end
  end
end
