require 'rails_helper'

RSpec.describe User, type: :model do
  describe '.from_github' do
    let(:auth) do
      OmniAuth::AuthHash.new(
        provider: 'github',
        uid: '12345',
        info: { nickname: 'octocat', name: 'The Octocat', image: 'https://avatars.example/octocat.png' },
        extra: { raw_info: { bio: 'Building things', location: 'San Francisco', company: '@github', blog: 'https://octocat.example' } },
        credentials: { token: 'gho_abc123' }
      )
    end

    it 'creates a user on first sign-in, seeding profile content from GitHub' do
      user = User.from_github(auth)
      expect(user).to be_persisted
      expect(user.github_id).to eq(12_345)
      expect(user.github_login).to eq('octocat')
      expect(user.handle).to eq('octocat')
      expect(user.name).to eq('The Octocat')
      expect(user.initials).to eq('TO')
      expect(user.avatar_url).to eq('https://avatars.example/octocat.png')
      expect(user.company).to eq('@github')
      expect(user.headline).to eq('Building things')
      expect(user.location).to eq('San Francisco')
      expect(user.website).to eq('https://octocat.example')
      expect(user.github_token).to eq('gho_abc123')
    end

    it 'falls back to the GitHub login when there is no name' do
      auth.info.name = nil
      user = User.from_github(auth)
      expect(user.name).to eq('octocat')
    end

    it "always refreshes identity fields (avatar, name, company), but never overwrites what the user wrote in EngLog" do
      user = User.from_github(auth)
      user.update!(handle: 'octo-renamed', headline: 'My own headline', location: 'My own city', website: 'https://mine.example')

      again = User.from_github(auth.merge(
        info: auth.info.merge(name: 'Updated Name', image: 'https://avatars.example/new.png'),
        extra: { raw_info: { bio: 'New bio', location: 'New city', company: 'New Co', blog: 'https://new.example' } },
        credentials: { token: 'gho_refreshed' },
      ))

      expect(again.id).to eq(user.id)
      expect(again.handle).to eq('octo-renamed')
      expect(again.github_token).to eq('gho_refreshed')
      expect(again.name).to eq('Updated Name')
      expect(again.avatar_url).to eq('https://avatars.example/new.png')
      expect(again.company).to eq('New Co')
      expect(again.headline).to eq('My own headline')
      expect(again.location).to eq('My own city')
      expect(again.website).to eq('https://mine.example')
    end
  end

  describe 'stack validation' do
    it 'rejects more than 12 tags' do
      user = build(:user, stack: Array.new(13) { |i| "tag#{i}" })
      expect(user).not_to be_valid
    end

    it 'rejects a tag longer than 24 characters' do
      user = build(:user, stack: ['a' * 25])
      expect(user).not_to be_valid
    end
  end

  describe '#github_url' do
    it 'links to the GitHub profile' do
      user = build(:user, github_login: 'octocat')
      expect(user.github_url).to eq('https://github.com/octocat')
    end
  end

  describe 'github_token' do
    it 'is encrypted at rest' do
      user = create(:user, github_token: 'gho_super_secret')
      raw = ActiveRecord::Base.connection.select_value("select github_token from users where id = #{user.id}")
      expect(raw).not_to include('gho_super_secret')
      expect(User.find(user.id).github_token).to eq('gho_super_secret')
    end
  end
end
