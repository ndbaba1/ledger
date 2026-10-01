require 'rails_helper'

RSpec.describe GithubEvidenceVerifier do
  describe '.parse_url' do
    it 'recognizes a PR URL' do
      expect(described_class.parse_url('https://github.com/acme/checkout/pull/42')).to eq(
        kind: :pr, owner: 'acme', repo: 'checkout', number: 42,
        url: 'https://github.com/acme/checkout/pull/42'
      )
    end

    it 'recognizes an issue URL, ignoring a trailing path, query and anchor' do
      expect(described_class.parse_url('https://www.github.com/acme/checkout/issues/7/files?x=1#diff')).to eq(
        kind: :issue, owner: 'acme', repo: 'checkout', number: 7,
        url: 'https://github.com/acme/checkout/issues/7'
      )
    end

    it 'returns nil for a non-GitHub host' do
      expect(described_class.parse_url('https://gitlab.com/acme/checkout/pull/42')).to be_nil
    end

    it 'returns nil for a GitHub URL that is neither a PR nor an issue' do
      expect(described_class.parse_url('https://github.com/acme/checkout')).to be_nil
    end

    it 'returns nil for garbage input' do
      expect(described_class.parse_url('not a url')).to be_nil
      expect(described_class.parse_url(nil)).to be_nil
    end
  end
end
