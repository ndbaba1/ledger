require 'rails_helper'

RSpec.describe Writeup, type: :model do
  it 'defaults an incident to draft status and empty fields' do
    w = create(:writeup)
    expect(w.status).to eq('draft')
    expect(w.fields['symptom']).to be_present
  end

  it 'defaults a design to proposed status' do
    w = create(:writeup, :design)
    expect(w.status).to eq('proposed')
  end

  it 'rejects a non-design write-up marked shipped' do
    w = build(:writeup, type: 'incident', status: 'shipped')
    expect(w).not_to be_valid
  end

  it 'rejects a design left in draft' do
    w = build(:writeup, :design, status: 'draft')
    expect(w).not_to be_valid
  end

  it 'is published once it has a post' do
    w = create(:writeup)
    expect(w).not_to be_published
    create(:post, writeup: w, user: w.user)
    expect(w.reload).to be_published
  end
end
