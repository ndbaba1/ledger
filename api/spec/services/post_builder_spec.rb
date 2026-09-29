require 'rails_helper'

RSpec.describe PostBuilder do
  # Mirrors the w_ratelimit fixture in web/src/api/fixtures.ts, so the section
  # headings and kinds this produces can be checked against what the
  # TypeScript `sectionsFor` produces for the same data.
  let(:writeup) do
    create(
      :writeup, :design,
      title: 'Per-tenant rate limiting at the edge',
      fields: {
        'context' => 'Envoy edge proxy · Redis 7 · ~40k requests/s at peak',
        'symptom' => 'Stop one noisy tenant from degrading the API for everyone, without adding latency to normal requests.',
        'constraints' => [
          'Under 2 ms added at p99',
          'Limits change without a deploy',
          'Keep working if Redis is briefly unavailable (fail open, alert)'
        ],
        'rootCause' => 'Enforce limits in the Envoy edge proxy using the global rate-limit service.',
        'flow' => ['Request hits Envoy', 'Rate-limit service checks tenant bucket', 'Redis counters (noeviction)', 'Allowed requests reach services'],
        'ruledOut' => [
          'Limits inside each service — a burst still costs a database round trip per request.',
          'A CDN rate-limit rule — can’t key on tenant, only IP.'
        ],
        'fix' => '',
        'lesson' => '',
        'signals' => []
      }
    )
  end

  it 'produces the same section headings and kinds as the TypeScript sectionsFor' do
    sections = PostBuilder.new(writeup).sections

    expect(sections.map { |s| [s['heading'], s['kind']] }).to eq([
      ['Goal', 'text'],
      ['Constraints', 'list'],
      ['Design', 'text'],
      ['Architecture', 'flow'],
      ['Alternatives', 'rejected'],
      ['Rollout', 'text']
    ])
  end

  it 'drops sections with a blank body when assembling the published post' do
    post = PostBuilder.call(writeup)
    expect(post.sections.map { |s| s['heading'] }).not_to include('Rollout')
  end

  describe 'for an incident' do
    it 'produces Problem / Investigation / Root cause / Solution' do
      w = create(:writeup, fields: {
        'context' => '', 'symptom' => 'p99 spiked', 'constraints' => [],
        'rootCause' => 'Pool halved', 'flow' => [],
        'ruledOut' => ['Scaled read replicas'], 'fix' => 'Reverted', 'lesson' => '', 'signals' => []
      })

      expect(PostBuilder.new(w).sections.map { |s| [s['heading'], s['kind']] }).to eq([
        ['Problem', 'text'],
        ['Investigation', 'dead_ends'],
        ['Root cause', 'text'],
        ['Solution', 'text']
      ])
    end
  end

  describe 'for a decision' do
    it 'produces Context / Options considered / Consequences' do
      w = create(:writeup, type: 'decision', fields: {
        'context' => '', 'symptom' => 'Pool sizes drifted', 'constraints' => [],
        'rootCause' => 'Derive pool size from worker count', 'flow' => [],
        'ruledOut' => ['Keep hand-tuning'], 'fix' => 'Every service picks this up.', 'lesson' => '', 'signals' => []
      })

      expect(PostBuilder.new(w).sections.map { |s| [s['heading'], s['kind']] }).to eq([
        ['Context', 'text'],
        ['Options considered', 'rejected'],
        ['Consequences', 'text']
      ])
    end
  end

  it 'assigns badges from evidence' do
    w = create(:writeup, title: 'Fixed the thing')
    create(:evidence, writeup: w, kind: 'github_pr', authored_by_user: true, repo: 'acme/checkout', merged_at: Time.zone.parse('2026-05-01'))
    create(:evidence, writeup: w, kind: 'link', url: 'https://docs.google.com/x')

    post = PostBuilder.call(w)
    expect(post.badges).to eq([{ 'label' => 'Authored & merged the fix', 'detail' => 'acme/checkout · May 2026', 'verified' => true, 'url' => 'https://github.com/acme/checkout/pull/42' }])
  end

  it 'de-duplicates slugs per author' do
    create(:post, user: writeup.user, slug: 'per-tenant-rate-limiting-at-the-edge')
    post = PostBuilder.call(writeup)
    expect(post.slug).to eq('per-tenant-rate-limiting-at-the-edge-2')
  end
end
