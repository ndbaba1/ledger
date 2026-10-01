require 'rails_helper'

RSpec.describe TemplateSections do
  Writeup::TYPES.each do |type|
    it "'s required keys for #{type} match Writeup::REQUIRED_FIELDS" do
      expect(described_class.required_keys_for(type)).to eq(Writeup::REQUIRED_FIELDS.fetch(type).map(&:first))
    end
  end

  it 'only lists keys that exist on Writeup#fields' do
    known = Writeup::EMPTY_FIELDS.keys
    Writeup::TYPES.each do |type|
      expect(described_class.keys_for(type) - known).to eq([])
    end
  end

  it 'covers every write-up type' do
    expect(described_class::SECTIONS.keys.sort).to eq(Writeup::TYPES.sort)
  end
end
