module Api
  module V1
    # Consent to send a private repo's PR/issue title, body and comments to
    # Anthropic for drafting. The timestamp is always server-set — the client
    # only ever says yes or no, never when.
    class PrivateDraftingConsentsController < BaseController
      before_action :require_user!

      def create
        current_user.update!(private_drafting_consent_at: Time.current)
        head :no_content
      end

      def destroy
        current_user.update!(private_drafting_consent_at: nil)
        head :no_content
      end
    end
  end
end
