import type {
  Draft,
  OpenCase,
  PublicPost,
  RedactionRule,
  TeamRecord,
  User,
  Workspace,
} from './types'

// Sample data for the mock API. The incident, company and teammates are
// illustrative; the agent-db-scan post and profile reflect real work.

export const ME_ID = 'u_nnamdi'

export const users: User[] = [
  {
    id: ME_ID,
    name: 'Nnamdi',
    handle: 'engineernamzy',
    initials: 'NN',
    avatarHue: 220,
    headline: 'Senior backend engineer · building VaultKit',
    location: 'Toronto',
    stack: ['go', 'postgres', 'clickhouse', 'rails', 'redis', 'python'],
    previously: [
      { org: 'HackerOne', summary: 'AI agent evaluation infrastructure' },
      { org: 'GitLab', summary: 'Analytics Platform · ClickHouse & batch pipelines' },
    ],
  },
  { id: 'u_amara', name: 'Amara K.', handle: 'amarak', initials: 'AK', avatarHue: 275 },
  { id: 'u_jordan', name: 'Jordan R.', handle: 'jordanr', initials: 'JR', avatarHue: 155 },
  { id: 'u_priya', name: 'Priya S.', handle: 'priyas', initials: 'PS', avatarHue: 20 },
  { id: 'u_leo', name: 'Leo M.', handle: 'leom', initials: 'LM', avatarHue: 190 },
]

export const workspace: Workspace = {
  id: 'w_platform',
  name: 'Platform Eng',
  slug: 'platform-eng',
  connections: [
    { provider: 'gitlab', label: '4 projects' },
    { provider: 'slack', label: '6 channels' },
    { provider: 'github', label: '2 repos' },
  ],
}

export const drafts: Draft[] = [
  {
    id: 'd_4821',
    slug: 'inc-4821',
    type: 'incident',
    title: 'Checkout p99 latency hit 4.2s after the PgBouncer pool was halved',
    service: 'checkout-api',
    severity: 'sev2',
    resolvedIn: '38 min',
    anchor: 'platform/checkout#4821',
    trigger: 'issue closed with ~ledger',
    createdAt: '2026-09-28T17:41:00Z',
    summary:
      'During the lunchtime peak, checkout p99 climbed from 310ms to 4.2s. Requests were queuing in PgBouncer, not in Postgres: a cost-cleanup MR had lowered `default_pool_size` from 40 to 20 [S5]. Reverting it restored latency within 18 minutes [S3] [S4].',
    rootCause:
      'MR !1874 cut `default_pool_size` from 40 to 20. At peak, checkout-api workers needed more connections than the pool had, so clients queued in PgBouncer [S5] [S2].',
    fix: 'Reverted in !1932 [S3]. Pool size is now derived from worker count in the Helm chart, so a cost change can’t silently undercut peak concurrency.',
    timeline: [
      { at: '12:14', kind: 'step', text: 'Latency alert fires in #inc-checkout; on-call opens a thread [S1]' },
      { at: '12:21', kind: 'dead_end', text: 'Scaled read replicas — primary CPU was 41%, not the bottleneck [S1]' },
      { at: '12:29', kind: 'step', text: 'Issue #4821 opened; Slack thread linked in the description [S2]' },
      { at: '12:37', kind: 'step', text: '`SHOW POOLS` shows cl_waiting climbing; pool pinned at 20 [S2]' },
      { at: '12:40', kind: 'step', text: 'Traced to MR !1874, merged the day before [S5]' },
      { at: '12:52', kind: 'fix', text: 'Revert MR !1932 deployed; p99 back to 310ms [S3]' },
    ],
    gaps: [
      {
        id: 'g1',
        kind: 'missing_context',
        prompt: 'No source explains why !1874 halved the pool. Readers will ask whether it’s safe to lower again.',
        status: 'open',
      },
      {
        id: 'g2',
        kind: 'unsupported_claim',
        prompt: '“cl_waiting peaked at 180” — mentioned in chat, but no screenshot or query output is attached.',
        status: 'open',
      },
    ],
    sources: [
      { key: 'S1', kind: 'slack', title: '#inc-checkout thread', detail: '41 messages · 5 people · via issue link', status: 'fetched', hops: 1 , excerpt: { kind: 'quotes', quotes: ['scaled read replicas, p99 didn’t move. primary cpu is sitting at 41%', 'SHOW POOLS: cl_waiting keeps climbing and the pool is pinned at 20'] } },
      { key: 'S2', kind: 'gitlab_issue', title: 'Issue #4821', detail: 'description + 23 comments', status: 'fetched', hops: 0 , excerpt: { kind: 'quotes', quotes: ['this started right after yesterday’s deploy — anything touch the pooler?'] } },
      { key: 'S3', kind: 'gitlab_mr', title: 'MR !1932 · Revert pool size', detail: 'merged · +1 −1 · closes #4821', status: 'fetched', hops: 1, authoredByMe: true , excerpt: { kind: 'diff', file: 'charts/checkout/values.yaml', lines: [{ op: '-', text: 'default_pool_size: 20' }, { op: '+', text: 'default_pool_size: 40' }] } },
      { key: 'S4', kind: 'link', title: 'Grafana · checkout p99 panel', detail: 'link only · no connector', status: 'linked', hops: 1 },
      { key: 'S5', kind: 'gitlab_mr', title: 'MR !1874 · Reduce pgbouncer pool', detail: 'found 2 hops out · via comment on S2', status: 'fetched', hops: 2 , excerpt: { kind: 'diff', file: 'charts/checkout/values.yaml', lines: [{ op: ' ', text: 'pgbouncer:' }, { op: '-', text: '  default_pool_size: 40' }, { op: '+', text: '  default_pool_size: 20  # cost cleanup' }] } },
      { key: 'S6', kind: 'doc', title: 'Google Doc · capacity notes', detail: 'pasted by you · 2 sections used', status: 'pasted', hops: 0 },
    ],
    redactions: [
      { label: 'postgres:// connection string', count: 1 },
      { label: 'internal IP address', count: 2 },
      { label: 'API token (glpat-…)', count: 1 },
    ],
    coAuthorIds: [ME_ID, 'u_amara', 'u_jordan'],
    status: 'needs_review',
  },
  {
    id: 'd_912',
    slug: 'inv-912',
    type: 'investigation',
    title: 'Stripe webhooks processed twice after the Sidekiq retry change',
    service: 'billing-worker',
    anchor: 'northwind/billing#912',
    trigger: 'PR merged with label ledger',
    createdAt: '2026-09-28T14:05:00Z',
    summary:
      'A handful of customers were charged credits twice. The webhook handler wasn’t idempotent, and a new retry policy re-ran jobs that had already succeeded but timed out on the ack [S2].',
    rootCause:
      'The job wrote the ledger entry, then timed out calling Stripe’s API. The raised timeout triggered a retry that wrote the entry again [S2] [S3].',
    fix: 'Added a unique index on `stripe_event_id` and made the handler upsert [S3].',
    timeline: [
      { at: 'Mon', kind: 'step', text: 'Support reports duplicate credit grants [S1]' },
      { at: 'Mon', kind: 'dead_end', text: 'Suspected Stripe resending events — their dashboard showed single deliveries [S1]' },
      { at: 'Tue', kind: 'step', text: 'Job logs show the same event ID processed twice, 30s apart [S2]' },
      { at: 'Tue', kind: 'fix', text: 'Unique index plus upsert merged [S3]' },
    ],
    gaps: [
      {
        id: 'g1',
        kind: 'missing_context',
        prompt: 'How were the affected customers found and corrected? Nothing in the sources covers the cleanup.',
        status: 'open',
      },
    ],
    sources: [
      { key: 'S1', kind: 'slack', title: '#billing-support thread', detail: '12 messages · 3 people', status: 'fetched', hops: 1 },
      { key: 'S2', kind: 'github_issue', title: 'Issue #912', detail: 'description + 9 comments', status: 'fetched', hops: 0 },
      { key: 'S3', kind: 'github_pr', title: 'PR #918 · Idempotent webhook handler', detail: 'merged · +48 −6', status: 'fetched', hops: 1, authoredByMe: true },
      { key: 'S4', kind: 'link', title: 'Sidekiq retry docs', detail: 'link only', status: 'linked', hops: 1 },
    ],
    redactions: [{ label: 'customer email address', count: 3 }],
    coAuthorIds: [ME_ID, 'u_priya'],
    status: 'needs_review',
  },
  {
    id: 'd_adr7',
    slug: 'adr-7',
    type: 'decision',
    title: 'Move product analytics events from Postgres to ClickHouse',
    service: 'events-pipeline',
    anchor: 'platform/data#301',
    trigger: 'issue closed with ~ledger',
    createdAt: '2026-09-27T20:10:00Z',
    summary:
      'Event tables in the primary Postgres grew past 900M rows, and dashboard queries were competing with checkout traffic for I/O [S1].',
    rootCause:
      'Stream events into ClickHouse through a batch loader, keeping Postgres as the system of record for orders only [S1] [S2].',
    fix: 'Dashboards move to ClickHouse; the old event tables are dropped after a 30-day dual-write window [S2].',
    timeline: [
      { at: 'Opt A', kind: 'dead_end', text: 'Partition the Postgres tables — helps retention, not the I/O contention [S1]' },
      { at: 'Opt B', kind: 'dead_end', text: 'Read replica for analytics — replication lag broke same-day dashboards [S1]' },
      { at: 'Opt C', kind: 'fix', text: 'ClickHouse with a batch loader — chosen [S2]' },
    ],
    gaps: [],
    sources: [
      { key: 'S1', kind: 'gitlab_issue', title: 'Issue #301 · analytics storage', detail: 'description + 31 comments', status: 'fetched', hops: 0 },
      { key: 'S2', kind: 'doc', title: 'Confluence · events pipeline RFC', detail: 'pasted by you', status: 'pasted', hops: 0 },
    ],
    redactions: [],
    coAuthorIds: [ME_ID],
    status: 'needs_review',
  },
]

export const cases: OpenCase[] = [
  {
    id: 'c_4870',
    title: 'Intermittent 502s from the edge on large uploads',
    anchor: 'platform/edge#4870',
    openedVia: 'label ~ledger on issue',
    openedAt: '2026-09-28T13:20:00Z',
    sourceCount: 4,
    ownerId: ME_ID,
  },
  {
    id: 'c_search',
    title: 'Search reindex job stalls at 80%',
    anchor: '#search-eng thread',
    openedVia: '/ledger track in Slack',
    openedAt: '2026-09-27T16:02:00Z',
    sourceCount: 2,
    ownerId: 'u_jordan',
  },
  {
    id: 'c_vec',
    title: 'pgvector vs a dedicated vector database for search',
    anchor: 'platform/data#318',
    openedVia: 'opened manually',
    openedAt: '2026-09-25T10:45:00Z',
    sourceCount: 5,
    ownerId: 'u_amara',
  },
]

export const records: TeamRecord[] = [
  {
    id: 'LR-212',
    type: 'incident',
    title: 'Checkout p99 latency hit 4.2s after the PgBouncer pool was halved',
    tags: ['checkout-api', 'pgbouncer', 'postgres'],
    authorIds: [ME_ID, 'u_amara', 'u_jordan'],
    publishedAt: '2026-09-24T19:00:00Z',
    symptom:
      'At lunchtime peak, checkout-api p99 went from 310ms to 4.2s. Error rate stayed flat — requests were slow, not failing. Dashboard: grafana.internal/d/chk-p99.',
    rootCause:
      'A cost-cleanup MR the day before cut `default_pool_size` from 40 to 20. At peak, checkout-api workers needed more connections than the pool had, so clients queued in PgBouncer. Jordan R. confirmed it with `SHOW POOLS`: cl_waiting kept climbing.',
    ruledOut: [
      'Database CPU — Amara K. scaled read replicas, but primary CPU held at 41%.',
      'A slow query — `pg_stat_statements` showed no new or regressed statements.',
    ],
    detection: {
      language: 'sql',
      code: '-- on the pgbouncer admin console\nSHOW POOLS;\n-- cl_waiting > 0 for more than 30s means the pool is too small\n-- alert: pgbouncer_pools_client_waiting_connections > 10',
    },
    fix: 'Reverted the pool size, then changed the Helm chart so pool size is derived from worker count. Platform Eng added an alert on waiting clients. Tracked in platform/checkout#4821.',
    lesson: 'Derive pool size from worker count, and alert on waiting clients — not on DB CPU.',
    context: 'PostgreSQL 16 · PgBouncer in session mode · checkout-api at lunchtime peak',
    result: { label: 'Checkout p99', before: '4.2s', after: '310ms' },
    notes: [],
    sources: [
      { key: 'S1', kind: 'slack', title: '#inc-checkout thread', detail: '41 messages · 5 people', status: 'fetched', hops: 1 , excerpt: { kind: 'quotes', quotes: ['scaled read replicas, p99 didn’t move. primary cpu is sitting at 41%', 'SHOW POOLS: cl_waiting keeps climbing and the pool is pinned at 20'] } },
      { key: 'S2', kind: 'gitlab_issue', title: 'Issue #4821', detail: 'description + 23 comments', status: 'fetched', hops: 0 , excerpt: { kind: 'quotes', quotes: ['this started right after yesterday’s deploy — anything touch the pooler?'] } },
      { key: 'S3', kind: 'gitlab_mr', title: 'MR !1932 · Revert pool size', detail: 'merged · +1 −1', status: 'fetched', hops: 1, authoredByMe: true , excerpt: { kind: 'diff', file: 'charts/checkout/values.yaml', lines: [{ op: '-', text: 'default_pool_size: 20' }, { op: '+', text: 'default_pool_size: 40' }] } },
      { key: 'S4', kind: 'link', title: 'Grafana · checkout p99 panel', detail: 'link only', status: 'linked', hops: 1 },
      { key: 'S5', kind: 'gitlab_mr', title: 'MR !1874 · Reduce pgbouncer pool', detail: 'merged the day before', status: 'fetched', hops: 2 , excerpt: { kind: 'diff', file: 'charts/checkout/values.yaml', lines: [{ op: ' ', text: 'pgbouncer:' }, { op: '-', text: '  default_pool_size: 40' }, { op: '+', text: '  default_pool_size: 20  # cost cleanup' }] } },
      { key: 'S6', kind: 'doc', title: 'Google Doc · capacity notes', detail: 'pasted', status: 'pasted', hops: 0 },
    ],
    questions: [
      {
        id: 'q1',
        authorId: 'u_priya',
        authorRole: 'billing team',
        body: 'We run the same PgBouncer setup on billing-api. Is 20 always too low, or only for checkout’s worker count?',
        at: '2026-09-26T15:00:00Z',
        answer: {
          authorId: ME_ID,
          body: 'Only relative to workers. Rule of thumb: pool ≥ peak concurrent requests per pod × pods. Billing peaks lower, so 20 may be fine there.',
          at: '2026-09-27T14:10:00Z',
        },
      },
      {
        id: 'q2',
        authorId: 'u_leo',
        authorRole: 'SRE',
        body: 'Would autoscaling pods have made this worse?',
        at: '2026-09-28T12:30:00Z',
      },
    ],
    history: [
      { at: '2026-09-24T19:00:00Z', byId: ME_ID, summary: 'Published from draft inc-4821' },
      { at: '2026-09-25T09:12:00Z', byId: 'u_jordan', summary: 'Added the SHOW POOLS check' },
      { at: '2026-09-25T16:40:00Z', byId: 'u_amara', summary: 'Clarified the replica dead end' },
    ],
    relatedIds: ['LR-148', 'LR-213'],
  },
  {
    id: 'LR-148',
    type: 'incident',
    title: 'Billing API timeouts during the month-end batch',
    tags: ['billing-api', 'pgbouncer', 'batch'],
    authorIds: ['u_priya'],
    publishedAt: '2026-03-31T21:00:00Z',
    symptom: 'Month-end invoicing made interactive billing requests time out for about 25 minutes.',
    rootCause: 'The invoicing batch held long transactions in session pooling mode, pinning most PgBouncer connections.',
    ruledOut: ['Lock contention — `pg_locks` showed no blocked writers.'],
    fix: 'Moved the batch to its own pool with a separate user, and chunked transactions to 500 invoices.',
    lesson: 'Give batch jobs their own pool so they can’t starve interactive traffic.',
    notes: [],
    sources: [
      { key: 'S1', kind: 'gitlab_issue', title: 'Issue #3310', detail: '14 comments', status: 'fetched', hops: 0 },
      { key: 'S2', kind: 'gitlab_mr', title: 'MR !1402 · Batch pool', detail: 'merged', status: 'fetched', hops: 1, excerpt: { kind: 'diff', file: 'config/pgbouncer.ini', lines: [{ op: '+', text: '[databases] billing_batch = pool_size=10 pool_mode=transaction' }] } },
    ],
    questions: [],
    history: [{ at: '2026-03-31T21:00:00Z', byId: 'u_priya', summary: 'Published' }],
    relatedIds: ['LR-212'],
  },
  {
    id: 'LR-213',
    type: 'decision',
    title: 'Derive database pool sizes from worker count',
    tags: ['pgbouncer', 'helm', 'capacity'],
    authorIds: [ME_ID, 'u_jordan'],
    publishedAt: '2026-09-26T17:30:00Z',
    symptom: 'Pool sizes were hand-set per service and drifted from actual concurrency, which caused LR-212.',
    rootCause: 'Compute `default_pool_size` in the Helm chart as workers × threads × pods, with a floor and a ceiling.',
    ruledOut: [
      'Keep hand-tuning with a review checklist — relies on people remembering.',
      'Switch every service to transaction pooling — breaks session features two services depend on.',
    ],
    fix: 'All services on the shared chart pick this up on their next deploy.',
    lesson: 'Configuration that depends on other configuration should be computed, not copied.',
    context: 'Shared Helm chart · PgBouncer in front of every service',
    notes: [],
    sources: [
      { key: 'S1', kind: 'gitlab_mr', title: 'MR !1940 · Computed pool size', detail: 'merged', status: 'fetched', hops: 0, authoredByMe: true },
    ],
    questions: [],
    history: [{ at: '2026-09-26T17:30:00Z', byId: ME_ID, summary: 'Published' }],
    relatedIds: ['LR-212'],
  },
  {
    id: 'LR-201',
    type: 'investigation',
    title: 'Flaky CI: the Postgres test database ran out of connections under parallel specs',
    tags: ['ci', 'postgres', 'rspec'],
    authorIds: ['u_amara'],
    publishedAt: '2026-08-14T15:00:00Z',
    symptom: 'About 1 in 8 CI runs failed with “too many clients already”, always in different specs.',
    rootCause: 'Parallel test workers each opened a pool of 10, exceeding `max_connections` on the CI database.',
    ruledOut: ['Leaked connections in a specific spec — failures moved around between runs.'],
    fix: 'Set the pool to 2 per test worker and raised `max_connections` on the CI image.',
    lesson: 'Random failures that move between tests usually mean shared resource limits, not test bugs.',
    result: { label: 'CI failure rate', before: '1 in 8 runs', after: '0 in 200 runs' },
    notes: [],
    sources: [{ key: 'S1', kind: 'gitlab_mr', title: 'MR !1711', detail: 'merged', status: 'fetched', hops: 0 }],
    questions: [],
    history: [{ at: '2026-08-14T15:00:00Z', byId: 'u_amara', summary: 'Published' }],
    relatedIds: [],
  },
  {
    id: 'LR-190',
    type: 'incident',
    title: 'Redis eviction dropped rate-limit keys during a traffic spike',
    tags: ['redis', 'rate-limiting'],
    authorIds: ['u_leo', ME_ID],
    publishedAt: '2026-07-22T18:00:00Z',
    symptom: 'A bot spike got through the API rate limiter for about 10 minutes.',
    rootCause: 'The shared Redis hit `maxmemory` with `allkeys-lru`, so it evicted rate-limit counters alongside cache entries.',
    ruledOut: ['A limiter bug — counters were correct until they disappeared.'],
    fix: 'Moved rate limiting to its own Redis with `noeviction`.',
    lesson: 'Never share an evicting Redis between cache and correctness-critical keys.',
    notes: [],
    sources: [{ key: 'S1', kind: 'slack', title: '#inc-api thread', detail: '28 messages', status: 'fetched', hops: 0 }],
    questions: [],
    history: [{ at: '2026-07-22T18:00:00Z', byId: 'u_leo', summary: 'Published' }],
    relatedIds: [],
  },
]

/** Hand-tuned redaction rules for records that have them; others get defaults. */
export const promotionRules: Record<string, RedactionRule[]> = {
  'LR-212': [
    { id: 'services', label: 'Service names', replacements: [{ match: 'checkout-api', with: 'the checkout service' }], enabled: true },
    {
      id: 'teammates',
      label: 'Teammate names',
      replacements: [
        { match: 'Amara K.', with: 'a teammate' },
        { match: 'Jordan R.', with: 'a teammate' },
      ],
      enabled: true,
    },
    {
      id: 'links',
      label: 'Internal links',
      replacements: [
        { match: 'Dashboard: grafana.internal/d/chk-p99.', with: '' },
        { match: 'Tracked in platform/checkout#4821.', with: '' },
      ],
      enabled: true,
    },
    { id: 'workspace', label: 'Team name', replacements: [{ match: 'Platform Eng', with: 'The team' }], enabled: true },
  ],
}

export const posts: PublicPost[] = [
  {
    slug: 'read-only-postgres-login-delete',
    authorId: ME_ID,
    type: 'investigation',
    title: 'My agent’s “read-only” Postgres login tried to DELETE rows. Here’s how the grants allowed it.',
    tags: ['postgres', 'security', 'ai-agents'],
    summary:
      'Nobody granted DELETE on purpose — it came through ordinary role membership. Checking direct grants would never have shown it.',
    context: 'PostgreSQL · a login provisioned for an AI agent · meant to be read-only',
    sections: [
      {
        heading: 'Problem',
        body: 'I provisioned a Postgres login for an AI agent that was supposed to be read-only. While investigating stale test data, the agent attempted a `DELETE`.',
      },
      {
        heading: 'Why it was allowed',
        body: 'The write access came through ordinary role membership: the login inherited privileges from a role that could write. Nobody had explicitly intended that, and looking at the login’s own grants didn’t reveal it.',
      },
      {
        heading: 'What agent-db-scan resolves',
        kind: 'list',
        body: '- ownership\n- inherited roles\n- `PUBLIC` grants\n- default privileges on future objects',
      },
      {
        heading: 'How it stays safe',
        body: '`agent-db-scan` resolves those effective privileges without writing to the database or reading table contents.',
      },
    ],
    lesson: 'Audit what a credential can actually do, not what it was granted directly.',
    badges: [
      {
        label: 'Maintainer',
        detail: 'vaultkit-inc/agent-db-scan',
        verified: true,
        url: 'https://github.com/vaultkit-inc/agent-db-scan',
      },
    ],
    publishedAt: '2026-09-22T16:00:00Z',
  },
]
