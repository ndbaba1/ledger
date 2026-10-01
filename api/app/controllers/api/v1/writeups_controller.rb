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
        raise Unprocessable, 'Unknown record type.' unless Writeup::TYPES.include?(type)

        writeup = current_user.writeups.create!(type: type)
        render json: WriteupSerializer.call(writeup), status: :created
      end

      def show
        render json: WriteupSerializer.call(owned_writeup!)
      end

      def update
        writeup = owned_writeup!

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

      # Drafts only — a published (or ever-published) write-up can't be
      # deleted here; unpublishing/deleting a record is separate work. Hard
      # deletes the writeup and its evidence; any DraftRequest for it keeps
      # its row (the daily cap is counted from these) with writeup_id set to
      # null — see Writeup#draft_requests and DraftFromSourceJob.
      def destroy
        writeup = current_user.writeups.find(params[:id])

        if writeup.published?
          return render json: { error: "Published records can't be deleted yet.", code: 'published' }, status: :unprocessable_content
        end

        writeup.draft_requests.where(status: 'drafting').find_each(&:mark_failed_if_stale!)
        if writeup.draft_requests.exists?(status: 'drafting')
          return render json: { error: 'Still drafting — wait for it to finish.' }, status: :conflict
        end

        Writeup.transaction { writeup.destroy! }
        head :no_content
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
