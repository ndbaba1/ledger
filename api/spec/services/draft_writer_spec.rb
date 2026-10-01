require 'rails_helper'

RSpec.describe DraftWriter do
  let(:context) do
    GithubSourceContext::Result.new(
      text: "[PR #14]\nFix the pool\n\nHalved the connection pool by mistake.",
      labels: ['PR #14']
    )
  end

  before { ENV['ANTHROPIC_API_KEY'] = 'sk-test' }
  after { ENV.delete('ANTHROPIC_API_KEY') }

  def stub_messages(responses)
    call_count = 0
    stub_request(:post, 'https://api.anthropic.com/v1/messages').to_return do |_request|
      body = responses[call_count] || responses.last
      call_count += 1
      { status: 200, body: body.to_json, headers: { 'Content-Type' => 'application/json' } }
    end
  end

  def message_body(input, name: 'submit_draft')
    {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
      content: [{ type: 'tool_use', id: 'toolu_1', name: name, input: input }],
      stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 10 }
    }
  end

  def valid_sections
    {
      'context' => { 'text' => '', 'sources' => [], 'missing' => 'No environment details in the source.' },
      'symptom' => { 'text' => 'The pool was halved.', 'sources' => ['PR #14'], 'missing' => '' },
      'ruledOut' => { 'text' => '', 'sources' => [], 'missing' => 'No dead ends mentioned.' },
      'rootCause' => { 'text' => 'A config change halved it.', 'sources' => ['PR #14'], 'missing' => '' },
      'fix' => { 'text' => 'Reverted the change.', 'sources' => ['PR #14'], 'missing' => '' },
      'lesson' => { 'text' => '', 'sources' => [], 'missing' => 'No lesson stated.' }
    }
  end

  it 'returns a validated draft for a given template, without asking the model to pick one' do
    stub_messages([message_body({ 'title' => 'Fixed the pool', 'sections' => valid_sections })])

    result = described_class.new(context: context, template: 'incident').call

    expect(result.template).to eq('incident')
    expect(result.title).to eq('Fixed the pool')
    expect(result.sections['symptom']['sources']).to eq(['PR #14'])
    expect(result.model).to eq('claude-sonnet-5')
    expect(result.prompt_version).to eq('v2')
    expect(WebMock).to have_requested(:post, 'https://api.anthropic.com/v1/messages').times(1)
  end

  it 'asks the model to pick a template first when none is given' do
    stub_request(:post, 'https://api.anthropic.com/v1/messages')
      .to_return(
        { status: 200, body: message_body({ 'template' => 'decision' }, name: 'pick_template').to_json, headers: { 'Content-Type' => 'application/json' } },
        { status: 200, body: message_body({
          'title' => 'Chose X',
          'sections' => {
            'context' => { 'text' => '', 'sources' => [], 'missing' => 'n/a' },
            'symptom' => { 'text' => 'Context', 'sources' => ['PR #14'], 'missing' => '' },
            'rootCause' => { 'text' => 'Decision', 'sources' => ['PR #14'], 'missing' => '' },
            'ruledOut' => { 'text' => '', 'sources' => [], 'missing' => 'n/a' },
            'fix' => { 'text' => 'Consequences', 'sources' => ['PR #14'], 'missing' => '' },
            'lesson' => { 'text' => '', 'sources' => [], 'missing' => 'n/a' }
          }
        }).to_json, headers: { 'Content-Type' => 'application/json' } }
      )

    result = described_class.new(context: context, template: nil).call

    expect(result.template).to eq('decision')
    expect(WebMock).to have_requested(:post, 'https://api.anthropic.com/v1/messages').times(2)
  end

  it 'retries once on invalid output (unknown source label), then succeeds' do
    invalid = valid_sections.merge('symptom' => { 'text' => 'The pool was halved.', 'sources' => ['PR #999'], 'missing' => '' })
    stub_messages([
      message_body({ 'title' => 'x', 'sections' => invalid }),
      message_body({ 'title' => 'Fixed the pool', 'sections' => valid_sections })
    ])

    result = described_class.new(context: context, template: 'incident').call

    expect(result.title).to eq('Fixed the pool')
    expect(WebMock).to have_requested(:post, 'https://api.anthropic.com/v1/messages').times(2)
  end

  it 'fails gracefully after a second invalid attempt' do
    invalid = valid_sections.merge('symptom' => { 'text' => 'The pool was halved.', 'sources' => ['PR #999'], 'missing' => '' })
    stub_messages([message_body({ 'title' => 'x', 'sections' => invalid })])

    expect { described_class.new(context: context, template: 'incident').call }.to raise_error(DraftWriter::Failed)
    expect(WebMock).to have_requested(:post, 'https://api.anthropic.com/v1/messages').times(2)
  end

  it 'rejects an unknown section key' do
    bad = valid_sections.merge('notAField' => { 'text' => 'x', 'sources' => ['PR #14'], 'missing' => '' })
    stub_messages([message_body({ 'title' => 'x', 'sections' => bad })])

    expect { described_class.new(context: context, template: 'incident').call }.to raise_error(DraftWriter::Failed)
  end

  it 'rejects a non-empty section with no sources' do
    bad = valid_sections.merge('symptom' => { 'text' => 'The pool was halved.', 'sources' => [], 'missing' => '' })
    stub_messages([message_body({ 'title' => 'x', 'sections' => bad })])

    expect { described_class.new(context: context, template: 'incident').call }.to raise_error(DraftWriter::Failed)
  end

  it 'wraps an API error as Failed without leaking details' do
    stub_request(:post, 'https://api.anthropic.com/v1/messages').to_return(status: 500, body: { error: { message: 'boom' } }.to_json)

    expect { described_class.new(context: context, template: 'incident').call }.to raise_error(DraftWriter::Failed, 'Drafting failed.')
  end

  describe '.model_name' do
    it 'falls back to the default when ANTHROPIC_MODEL is unset' do
      ENV.delete('ANTHROPIC_MODEL')
      expect(described_class.model_name).to eq('claude-sonnet-5')
    end

    it 'falls back to the default when ANTHROPIC_MODEL is set but empty' do
      ENV['ANTHROPIC_MODEL'] = ''
      expect(described_class.model_name).to eq('claude-sonnet-5')
    ensure
      ENV.delete('ANTHROPIC_MODEL')
    end

    it 'uses ANTHROPIC_MODEL when set' do
      ENV['ANTHROPIC_MODEL'] = 'claude-opus-5'
      expect(described_class.model_name).to eq('claude-opus-5')
    ensure
      ENV.delete('ANTHROPIC_MODEL')
    end
  end

  describe '.configured?' do
    it 'is false when ANTHROPIC_API_KEY is unset or empty' do
      ENV.delete('ANTHROPIC_API_KEY')
      expect(described_class.configured?).to be false

      ENV['ANTHROPIC_API_KEY'] = ''
      expect(described_class.configured?).to be false
    end

    it 'is true when ANTHROPIC_API_KEY is set' do
      expect(described_class.configured?).to be true
    end
  end

  describe 'the fix section gate (closed-issue sources)' do
    def sections_with_fix(fix_text, sources: ['PR #14'])
      valid_sections.merge('fix' => { 'text' => fix_text, 'sources' => fix_text.present? ? sources : [], 'missing' => fix_text.present? ? '' : 'n/a' })
    end

    it "blanks a non-empty fix on an open issue, after one retry, instead of failing the draft" do
      issue_context = GithubSourceContext::Result.new(text: context.text, labels: context.labels, kind: :issue, issue_state: 'open')
      stub_messages([
        message_body({ 'title' => 'x', 'sections' => sections_with_fix('Reverted the change.') }),
        message_body({ 'title' => 'x', 'sections' => sections_with_fix('Reverted the change.') })
      ])

      result = described_class.new(context: issue_context, template: 'incident').call

      expect(result.sections['fix']).to eq('text' => '', 'sources' => [], 'missing' => 'Issue still open.')
      expect(WebMock).to have_requested(:post, 'https://api.anthropic.com/v1/messages').times(2)
    end

    it "blanks a non-empty fix on an issue closed as not_planned" do
      issue_context = GithubSourceContext::Result.new(text: context.text, labels: context.labels, kind: :issue, issue_state: 'closed', issue_state_reason: 'not_planned')
      stub_messages([message_body({ 'title' => 'x', 'sections' => sections_with_fix('Reverted the change.') })])

      result = described_class.new(context: issue_context, template: 'incident').call

      expect(result.sections['fix']['missing']).to eq('Closed without a fix.')
    end

    it 'blanks a non-empty fix on a completed issue with no merged PR of the user in the sources' do
      issue_context = GithubSourceContext::Result.new(text: context.text, labels: context.labels, kind: :issue, issue_state: 'closed', issue_state_reason: 'completed', user_merged_pr_present: false)
      stub_messages([message_body({ 'title' => 'x', 'sections' => sections_with_fix('Reverted the change.') })])

      result = described_class.new(context: issue_context, template: 'incident').call

      expect(result.sections['fix']['missing']).to eq('No merged PR of yours closed this issue.')
    end

    it 'allows a sourced fix on a completed issue with a merged PR of the user in the sources' do
      issue_context = GithubSourceContext::Result.new(text: context.text, labels: context.labels, kind: :issue, issue_state: 'closed', issue_state_reason: 'completed', user_merged_pr_present: true)
      stub_messages([message_body({ 'title' => 'x', 'sections' => sections_with_fix('Reverted the change.') })])

      result = described_class.new(context: issue_context, template: 'incident').call

      expect(result.sections['fix']).to eq('text' => 'Reverted the change.', 'sources' => ['PR #14'], 'missing' => '')
      expect(WebMock).to have_requested(:post, 'https://api.anthropic.com/v1/messages').times(1)
    end

    it 'never gates a PR-sourced draft (kind is not :issue)' do
      stub_messages([message_body({ 'title' => 'x', 'sections' => sections_with_fix('Reverted the change.') })])

      result = described_class.new(context: context, template: 'incident').call

      expect(result.sections['fix']['text']).to eq('Reverted the change.')
    end
  end
end
