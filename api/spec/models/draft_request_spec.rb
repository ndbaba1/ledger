require 'rails_helper'

RSpec.describe DraftRequest do
  describe '#stale?' do
    it 'is false for a fresh drafting request' do
      dr = create(:draft_request, status: 'drafting', created_at: 1.minute.ago)
      expect(dr.stale?).to be false
    end

    it 'is true for a drafting request older than STALE_AFTER' do
      dr = create(:draft_request, status: 'drafting', created_at: 4.minutes.ago)
      expect(dr.stale?).to be true
    end

    it 'is false for a resolved request, however old' do
      dr = create(:draft_request, status: 'ready', created_at: 1.hour.ago)
      expect(dr.stale?).to be false
    end
  end

  describe '#mark_failed_if_stale!' do
    it 'fails a stale request without counting it toward the cap, and returns true' do
      dr = create(:draft_request, status: 'drafting', created_at: 4.minutes.ago, counts_toward_cap: true)
      expect(dr.mark_failed_if_stale!).to be true
      expect(dr.reload).to have_attributes(status: 'failed', error: DraftRequest::INTERRUPTED_MESSAGE, counts_toward_cap: false)
    end

    it 'does nothing and returns false when not stale' do
      dr = create(:draft_request, status: 'drafting', created_at: 1.minute.ago)
      expect(dr.mark_failed_if_stale!).to be false
      expect(dr.reload.status).to eq('drafting')
    end

    it 'leaves the writeup attached' do
      dr = create(:draft_request, status: 'drafting', created_at: 4.minutes.ago)
      dr.mark_failed_if_stale!
      expect(dr.reload.writeup_id).to be_present
    end
  end
end
