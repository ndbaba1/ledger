require 'rails_helper'

RSpec.describe DraftFromSourceJob do
  let(:user) { create(:user, github_id: 1001, github_login: 'octocat', github_token: 'gho_test') }
  let(:writeup) { create(:writeup, user: user, type: 'incident') }
  let(:draft_request) do
    create(:draft_request, user: user, writeup: writeup, source_url: 'https://github.com/acme/checkout/pull/42', status: 'drafting', template: 'incident')
  end

  def stub_pr(body: {})
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/42')
      .to_return(status: 200, body: body.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_repo
    stub_request(:get, 'https://api.github.com/repos/acme/checkout')
      .to_return(status: 200, body: { private: false }.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_comments(body = [])
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/issues/42/comments')
      .with(query: hash_including({}))
      .to_return(status: 200, body: body.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_reviews(body = [])
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/42/reviews')
      .with(query: hash_including({}))
      .to_return(status: 200, body: body.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_anthropic(sections)
    body = {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'submit_draft', input: { title: 'Fixed the pool', sections: sections } }],
      stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 10 }
    }
    stub_request(:post, 'https://api.anthropic.com/v1/messages')
      .to_return(status: 200, body: body.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  before do
    stub_repo
    ENV['ANTHROPIC_API_KEY'] = 'sk-test'
  end

  after { ENV.delete('ANTHROPIC_API_KEY') }

  it 'drafts the writeup, saves drafting metadata, and counts toward the cap' do
    stub_pr(body: { number: 42, title: 'Fix the pool', body: 'Halved the pool by mistake.', created_at: '2026-09-19T00:00:00Z',
                    merged_at: '2026-09-20T00:00:00Z', user: { id: 2002, login: 'someone' }, base: { repo: { private: false } } })
    stub_reviews([])
    stub_comments([])
    stub_anthropic(
      'context' => { text: '', sources: [], missing: 'n/a' },
      'symptom' => { text: 'The pool was halved.', sources: ['PR #42'], missing: '' },
      'ruledOut' => { text: '', sources: [], missing: 'n/a' },
      'rootCause' => { text: 'A config change.', sources: ['PR #42'], missing: '' },
      'fix' => { text: 'Reverted.', sources: ['PR #42'], missing: '' },
      'lesson' => { text: '', sources: [], missing: 'n/a' }
    )

    described_class.new.perform(draft_request.id)

    draft_request.reload
    expect(draft_request.status).to eq('ready')
    expect(draft_request.counts_toward_cap).to be true

    writeup.reload
    expect(writeup.title).to eq('Fixed the pool')
    expect(writeup.field('symptom')).to eq('The pool was halved.')
    expect(writeup.draft_source_url).to eq('https://github.com/acme/checkout/pull/42')
    expect(writeup.draft_model).to eq('claude-sonnet-5')
    expect(writeup.draft_prompt_version).to eq('v2')
    expect(writeup.draft_sections_meta['symptom']).to eq('sources' => ['PR #42'])
  end

  it 'keeps the writeup and fails the request gracefully when the writer fails' do
    stub_pr(body: { number: 42, title: 'Fix the pool', body: 'Halved the pool by mistake.', created_at: '2026-09-19T00:00:00Z',
                    merged_at: '2026-09-20T00:00:00Z', user: { id: 2002, login: 'someone' }, base: { repo: { private: false } } })
    stub_reviews([])
    stub_comments([])
    allow(DraftWriter).to receive(:new).and_raise(DraftWriter::Failed, 'Drafting failed.')

    described_class.new.perform(draft_request.id)

    draft_request.reload
    expect(draft_request.status).to eq('failed')
    expect(draft_request.error).to eq('Drafting failed. Start from the template instead.')
    expect(draft_request.counts_toward_cap).to be false
    expect(draft_request.writeup_id).to eq(writeup.id)
    expect(Writeup.exists?(writeup.id)).to be true
  end

  it 'never leaks the source text into DraftRequest#error when the writer fails validation' do
    marker = 'VERY-SECRET-PR-BODY-MARKER'
    stub_pr(body: { number: 42, title: 'Fix the pool', body: "Halved the pool by mistake. #{marker}", created_at: '2026-09-19T00:00:00Z',
                    merged_at: '2026-09-20T00:00:00Z', user: { id: 2002, login: 'someone' }, base: { repo: { private: false } } })
    stub_reviews([])
    stub_comments([])
    # An unknown source label is a validation failure DraftWriter can't
    # recover from after its one retry (stub_messages reuses the same body).
    stub_anthropic(
      'context' => { text: '', sources: [], missing: 'n/a' },
      'symptom' => { text: marker, sources: ['NOT A REAL LABEL'], missing: '' },
      'ruledOut' => { text: '', sources: [], missing: 'n/a' },
      'rootCause' => { text: '', sources: [], missing: 'n/a' },
      'fix' => { text: '', sources: [], missing: 'n/a' },
      'lesson' => { text: '', sources: [], missing: 'n/a' }
    )

    described_class.new.perform(draft_request.id)

    draft_request.reload
    expect(draft_request.status).to eq('failed')
    expect(draft_request.error).to eq('Drafting failed. Start from the template instead.')
    expect(draft_request.error).not_to include(marker)
  end

  it 'resolves as a blank ready draft, not counted, if the full context turns out empty' do
    stub_pr(body: { number: 42, title: '', body: '', created_at: '2026-09-19T00:00:00Z',
                    merged_at: '2026-09-20T00:00:00Z', user: { id: 2002, login: 'someone' }, base: { repo: { private: false } } })
    stub_reviews([])
    stub_comments([])

    described_class.new.perform(draft_request.id)

    draft_request.reload
    expect(draft_request.status).to eq('ready')
    expect(draft_request.counts_toward_cap).to be false
    expect(draft_request.note).to eq(DraftRequest::EMPTY_SOURCE_NOTE)
    expect(WebMock).not_to have_requested(:post, 'https://api.anthropic.com/v1/messages')
  end

  it 'does nothing for a request that is no longer drafting' do
    draft_request.update!(status: 'ready')
    described_class.new.perform(draft_request.id)
    expect(WebMock).not_to have_requested(:get, %r{api\.github\.com})
  end

  it 'fails a request that went stale before the job ran, without touching GitHub' do
    draft_request.update!(created_at: 4.minutes.ago)
    described_class.new.perform(draft_request.id)

    draft_request.reload
    expect(draft_request.status).to eq('failed')
    expect(draft_request.error).to eq(DraftRequest::INTERRUPTED_MESSAGE)
    expect(WebMock).not_to have_requested(:get, %r{api\.github\.com})
  end
end
