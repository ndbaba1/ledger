require 'rails_helper'

RSpec.describe Evidence, type: :model do
  it 'rejects a duplicate url on the same write-up' do
    w = create(:writeup)
    create(:evidence, writeup: w, url: 'https://github.com/acme/checkout/pull/1', key: 'S1')
    dup = build(:evidence, writeup: w, url: 'https://github.com/acme/checkout/pull/1', key: 'S2')
    expect(dup).not_to be_valid
  end

  it 'rejects a kind outside github_pr/github_issue/link' do
    e = build(:evidence, kind: 'gitlab_mr')
    expect(e).not_to be_valid
  end
end
