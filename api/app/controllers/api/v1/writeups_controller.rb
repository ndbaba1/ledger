module Api
  module V1
    class WriteupsController < BaseController
      before_action :require_user!

      def index
        writeups = current_user.writeups.where.missing(:post).order(updated_at: :desc)
        render json: writeups.map { |w| WriteupSerializer.call(w) }
      end

      def create
        type = params[:type]
        raise Unprocessable, 'Unknown write-up type.' unless Writeup::TYPES.include?(type)

        writeup = current_user.writeups.create!(type: type)
        render json: WriteupSerializer.call(writeup), status: :created
      end

      def show
        render json: WriteupSerializer.call(owned_writeup!)
      end

      def update
        writeup = owned_writeup!
        raise Unprocessable, 'This write-up is already published.' if writeup.published?

        permitted = params.permit(
          :title, :context, :symptom, :rootCause, :fix, :lesson,
          constraints: [], flow: [], ruledOut: [],
          signals: %i[kind value foundIn],
          result: %i[label before after]
        ).to_h

        writeup.title = permitted['title'] if permitted.key?('title')
        fields = writeup.fields.merge(permitted.except('title'))
        # The client always sends `result`, dropped by JSON when cleared —
        # treat its absence as "clear it", not "leave it".
        fields['result'] = permitted['result']
        writeup.fields = fields
        writeup.save!
        render json: WriteupSerializer.call(writeup)
      end

      private

      def owned_writeup!
        writeup = Writeup.find(params[:id])
        raise Forbidden, "That write-up isn't yours." unless writeup.user_id == current_user.id

        writeup
      end
    end
  end
end
