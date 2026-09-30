require 'rails_helper'

RSpec.describe GithubApp do
  # Rails.cache is :null_store in test (see config/environments/test.rb) so
  # nothing normally persists between calls — swap in a real store for the
  # examples that are specifically about caching.
  around do |example|
    original = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    example.run
  ensure
    Rails.cache = original
  end

  describe '.installation_for' do
    it 'finds an installation and caches it, asking GitHub only once' do
      request = stub_installation_found('acme', 'checkout', installation_id: 55)

      expect(described_class.installation_for('acme', 'checkout')).to eq(55)
      expect(described_class.installation_for('acme', 'checkout')).to eq(55)
      expect(request).to have_been_requested.times(1)
    end

    it 'returns nil, and caches the miss, when the app is not installed' do
      request = stub_installation_missing('acme', 'private-repo')

      expect(described_class.installation_for('acme', 'private-repo')).to be_nil
      expect(described_class.installation_for('acme', 'private-repo')).to be_nil
      expect(request).to have_been_requested.times(1)
    end
  end

  describe '.installation_client' do
    it 'mints an installation token once and reuses it' do
      token_request = stub_installation_token(installation_id: 55, token: 'ghs_abc123')

      first = described_class.installation_client(55)
      second = described_class.installation_client(55)

      expect(first.bearer_token).to eq('ghs_abc123')
      expect(second.bearer_token).to eq('ghs_abc123')
      expect(token_request).to have_been_requested.times(1)
    end

    it 'mints a fresh token once the cached one is within 5 minutes of expiring' do
      stub_installation_token(installation_id: 66, token: 'ghs_old', expires_at: 4.minutes.from_now)
      described_class.installation_client(66)

      stub_installation_token(installation_id: 66, token: 'ghs_new', expires_at: 1.hour.from_now)
      client = described_class.installation_client(66)

      expect(client.bearer_token).to eq('ghs_new')
    end
  end

  describe '.install_url' do
    it 'points at the app install page' do
      expect(described_class.install_url).to eq("https://github.com/apps/#{described_class::SLUG}/installations/new")
    end

    it 'targets a specific account when its GitHub id is known' do
      expect(described_class.install_url(4321))
        .to eq("https://github.com/apps/#{described_class::SLUG}/installations/new/permissions?target_id=4321")
    end
  end

  describe 'setup state' do
    it 'round-trips who asked and for which write-up' do
      state = described_class.sign_setup_state(user_id: 7, writeup_id: 12)

      expect(described_class.verify_setup_state(state)).to eq('user_id' => 7, 'writeup_id' => 12)
    end

    it 'rejects a tampered state' do
      state = described_class.sign_setup_state(user_id: 7, writeup_id: 12)

      expect(described_class.verify_setup_state("#{state}garbage")).to be_nil
    end

    it 'rejects an expired state' do
      state = nil
      travel_to 20.minutes.ago do
        state = described_class.sign_setup_state(user_id: 7, writeup_id: 12)
      end

      expect(described_class.verify_setup_state(state)).to be_nil
    end
  end
end
