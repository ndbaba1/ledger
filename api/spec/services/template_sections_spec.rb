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

  it 'gives every section a purpose, for every type' do
    Writeup::TYPES.each do |type|
      described_class.for(type).each do |section|
        expect(section.purpose).to be_present, "#{type}.#{section.key} has no purpose"
      end
    end
  end

  it 'marks only the fix/consequences/rollout section as outcome, for every type' do
    Writeup::TYPES.each do |type|
      expect(described_class.outcome_keys_for(type)).to eq(['fix'])
    end
  end

  describe '.template_name' do
    it 'title-cases the type' do
      expect(described_class.template_name('incident')).to eq('Incident')
      expect(described_class.template_name('investigation')).to eq('Investigation')
      expect(described_class.template_name('decision')).to eq('Decision')
      expect(described_class.template_name('design')).to eq('Design')
    end
  end

  describe '.section_guide' do
    Writeup::TYPES.each do |type|
      it "includes every #{type} section's key, purpose, and the right modifiers" do
        guide = described_class.section_guide(type)
        lines = guide.split("\n")
        expect(lines.size).to eq(described_class.for(type).size)

        described_class.for(type).each do |section|
          line = lines.find { |l| l.start_with?("- #{section.key}") }
          expect(line).to be_present, "no guide line for #{type}.#{section.key}"
          expect(line).to include(section.purpose)
          expect(line).to include(' [outcome]') if section.outcome
          expect(line).not_to include(' [outcome]') unless section.outcome
          expect(line).to include(' (list)') if section.kind == :lines
          expect(line).not_to include(' (list)') unless section.kind == :lines
        end
      end
    end
  end
end
