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
    expect(result.prompt_version).to eq('v1')
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
end
