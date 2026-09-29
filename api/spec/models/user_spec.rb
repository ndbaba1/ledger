require 'rails_helper'

RSpec.describe User, type: :model do
  describe '.from_github' do
    let(:auth) do
      OmniAuth::AuthHash.new(
        provider: 'github',
        uid: '12345',
        info: { nickname: 'octocat', name: 'The Octocat', description: 'Building things' },
        credentials: { token: 'gho_abc123' }
      )
    end

    it 'creates a user on first sign-in' do
      user = User.from_github(auth)
      expect(user).to be_persisted
      expect(user.github_id).to eq(12_345)
      expect(user.github_login).to eq('octocat')
      expect(user.handle).to eq('octocat')
      expect(user.name).to eq('The Octocat')
      expect(user.initials).to eq('TO')
      expect(user.github_token).to eq('gho_abc123')
    end

    it 'updates the existing user and their token on a later sign-in, keeping a chosen handle' do
      user = User.from_github(auth)
      user.update!(handle: 'octo-renamed')

      again = User.from_github(auth.merge(credentials: { token: 'gho_refreshed' }))

      expect(again.id).to eq(user.id)
      expect(again.handle).to eq('octo-renamed')
      expect(again.github_token).to eq('gho_refreshed')
    end
  end
end
