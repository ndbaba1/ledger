require 'rails_helper'

RSpec.describe Hit, type: :model do
  it 'rejects a second hit from the same reader on the same post' do
    post = create(:post)
    reader = create(:user)
    create(:hit, post: post, user: reader)
    dup = build(:hit, post: post, user: reader)
    expect(dup).not_to be_valid
  end

  it "rejects hitting your own post" do
    post = create(:post)
    own_hit = build(:hit, post: post, user: post.user)
    expect(own_hit).not_to be_valid
  end
end
