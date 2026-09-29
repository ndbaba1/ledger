require 'rails_helper'

RSpec.describe Evidence, type: :model do
  it 'rejects a duplicate url on the same write-up' do
    w = create(:writeup)
    create(:evidence, writeup: w, url: 'https://github.com/acme/checkout/pull/1', key: 'S1')
    dup = build(:evidence, writeup: w, url: 'https://github.com/acme/checkout/pull/1', key: 'S2')
    expect(dup).not_to be_valid
    expect(dup.errors.full_messages).to eq(['Already added.'])
  end

  it 'allows the same url on a different write-up' do
    create(:evidence, url: 'https://github.com/acme/checkout/pull/1', key: 'S1')
    other = build(:evidence, url: 'https://github.com/acme/checkout/pull/1', key: 'S1')
    expect(other).to be_valid
  end

  it 'rejects a non-http(s) url' do
    e = build(:evidence, kind: 'link', url: 'javascript:alert(1)')
    expect(e).not_to be_valid
    expect(e.errors.full_messages).to eq(['Only http(s) links can be added.'])
  end

  it 'rejects an unparseable url' do
    e = build(:evidence, kind: 'link', url: 'not a url')
    expect(e).not_to be_valid
    expect(e.errors.full_messages).to eq(['Only http(s) links can be added.'])
  end

  it 'rejects a kind outside github_pr/github_issue/link' do
    e = build(:evidence, kind: 'gitlab_mr')
    expect(e).not_to be_valid
  end
end
