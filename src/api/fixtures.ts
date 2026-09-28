import type {
  PublicQuestion,
  Writeup,
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
  // Engineers outside this workspace who publish on Ledger.
  { id: 'u_hannah', name: 'Hannah L.', handle: 'hannahl', initials: 'HL', avatarHue: 330, headline: 'Staff engineer · payments', location: 'Berlin', stack: ['go', 'postgres', 'kafka'] },
  { id: 'u_tomas', name: 'Tomás R.', handle: 'tomasr', initials: 'TR', avatarHue: 95, headline: 'SRE · streaming platform', location: 'Lisbon', stack: ['kafka', 'jvm', 'kubernetes'] },
  { id: 'u_mei', name: 'Mei W.', handle: 'meiw', initials: 'MW', avatarHue: 45, headline: 'Data platform engineer', location: 'Singapore', stack: ['postgres', 'clickhouse', 'python'] },
  { id: 'u_ade', name: 'Ade O.', handle: 'adeo', initials: 'AO', avatarHue: 260, headline: 'Backend engineer · logistics', location: 'Lagos', stack: ['kotlin', 'sqlite', 'go'] },
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
    signals: [
      { kind: 'alert', value: 'CheckoutP99LatencyHigh', foundIn: 'S1' },
      { kind: 'metric', value: 'pgbouncer_pools_client_waiting_connections', foundIn: 'S2' },
    ],
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
    id: 'LR-220',
    type: 'design',
    title: 'Webhook delivery service with retries and a dead-letter queue',
    tags: ['webhooks', 'redis', 'outbox'],
    authorIds: [ME_ID, 'u_jordan'],
    publishedAt: '2026-09-27T15:00:00Z',
    symptom:
      'Deliver customer webhooks reliably: at least once, in order per endpoint, and without an API request ever waiting on a customer’s server. The old path sent webhooks inline from api-server, so one slow endpoint slowed our whole API [S1].',
    constraints: [
      'About 2,000 events per second at peak, with bursts during month-end billing',
      'No lost events across a deploy or a worker crash',
      'Reuse Postgres and Redis — no new infrastructure this quarter',
      'Customers must be able to see failed deliveries and replay them',
    ],
    rootCause:
      'Write each event to an `outbox` table in the same transaction as the change that caused it. A relay tails the outbox and pushes events onto a Redis stream per partition. Delivery workers read the stream, sign each payload, and retry with exponential backoff for 24 hours before moving it to a dead-letter queue that customers can replay from the dashboard [S2] [S3].',
    flow: [
      'API writes the change and an `outbox` row in one transaction',
      'Relay tails `outbox` onto a Redis stream',
      'Workers sign and POST, retrying with backoff',
      'Dead-letter queue with replay in the dashboard',
    ],
    ruledOut: [
      'Kafka — the right tool at larger scale, but a new cluster to run for a two-person team.',
      'Enqueueing a job right after commit — loses the event if the process dies between the two.',
      'A managed webhook vendor — per-event pricing at our volume cost more than building it.',
    ],
    fix: 'Sent from both the old and new paths behind a flag for a week, compared delivery logs per endpoint, then moved customers over in 10% cohorts [S4]. Jordan R. built the replay screen in the final week.',
    lesson: 'The outbox pattern gives you transactional delivery without a new broker. Start there before reaching for Kafka.',
    context: 'Postgres 16 · Redis 7 streams · ~2k events/s at peak',
    signals: [
      { kind: 'alert', value: 'WebhookDeliveryFailureRateHigh' },
      { kind: 'metric', value: 'webhook_dlq_depth' },
    ],
    result: { label: 'Webhooks delivered on the first attempt', before: '92.1%', after: '99.7%' },
    notes: [],
    sources: [
      { key: 'S1', kind: 'gitlab_issue', title: 'Issue #5102 · Webhooks block API requests', detail: 'description + 18 comments', status: 'fetched', hops: 0, excerpt: { kind: 'quotes', quotes: ['p99 on POST /invoices is 3s whenever one customer’s endpoint is slow', 'we need delivery off the request path entirely'] } },
      { key: 'S2', kind: 'doc', title: 'RFC · Webhook delivery v2', detail: 'pasted by you · 4 sections used', status: 'pasted', hops: 0 },
      { key: 'S3', kind: 'gitlab_mr', title: 'MR !2010 · Outbox relay', detail: 'merged · +412 −37', status: 'fetched', hops: 1, authoredByMe: true, excerpt: { kind: 'diff', file: 'db/migrate/20260902_create_outbox.rb', lines: [{ op: '+', text: 'create_table :outbox do |t|' }, { op: '+', text: '  t.string :topic, null: false' }, { op: '+', text: '  t.jsonb :payload, null: false' }, { op: '+', text: '  t.datetime :relayed_at, index: true' }, { op: '+', text: 'end' }] } },
      { key: 'S4', kind: 'slack', title: '#webhooks-migration thread', detail: '26 messages · 4 people', status: 'fetched', hops: 1, excerpt: { kind: 'quotes', quotes: ['dual-send diff is clean for the first 10% cohort, moving to 30% tomorrow'] } },
    ],
    questions: [
      {
        id: 'q1',
        authorId: 'u_priya',
        authorRole: 'billing team',
        body: 'How do you keep per-endpoint ordering when a delivery is being retried?',
        at: '2026-09-28T10:20:00Z',
        answer: {
          authorId: ME_ID,
          body: 'Each endpoint maps to one stream partition, and a worker holds the partition until the head event succeeds or moves to the dead-letter queue.',
          at: '2026-09-28T11:05:00Z',
        },
      },
    ],
    history: [{ at: '2026-09-27T15:00:00Z', byId: ME_ID, summary: 'Published' }],
    relatedIds: [],
    promotedPostSlug: 'webhook-delivery-outbox-design',
  },
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
    signals: [
      { kind: 'alert', value: 'CheckoutP99LatencyHigh', foundIn: 'S1' },
      { kind: 'metric', value: 'pgbouncer_pools_client_waiting_connections', foundIn: 'S2' },
      { kind: 'error', value: 'context deadline exceeded while acquiring connection', foundIn: 'S1' },
    ],
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
    signals: [
      { kind: 'alert', value: 'BillingApiTimeouts', foundIn: 'S1' },
      { kind: 'error', value: 'query_wait_timeout', foundIn: 'S1' },
    ],
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
    signals: [{ kind: 'metric', value: 'pgbouncer_pools_client_waiting_connections' }],
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
    signals: [{ kind: 'error', value: 'FATAL: sorry, too many clients already', foundIn: 'S1' }],
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
    signals: [
      { kind: 'alert', value: 'ApiRateLimitBypassed', foundIn: 'S1' },
      { kind: 'metric', value: 'redis_evicted_keys_total', foundIn: 'S1' },
      { kind: 'log', value: 'OOM command not allowed when used memory > maxmemory', foundIn: 'S1' },
    ],
    notes: [],
    sources: [{ key: 'S1', kind: 'slack', title: '#inc-api thread', detail: '28 messages', status: 'fetched', hops: 0 }],
    questions: [],
    history: [{ at: '2026-07-22T18:00:00Z', byId: 'u_leo', summary: 'Published' }],
    relatedIds: [],
  },
]

/** Hand-tuned redaction rules for records that have them; others get defaults. */
export const promotionRules: Record<string, RedactionRule[]> = {
  'LR-220': [
    { id: 'services', label: 'Service names', replacements: [{ match: 'api-server', with: 'our API' }], enabled: true },
    { id: 'teammates', label: 'Teammate names', replacements: [{ match: 'Jordan R.', with: 'A teammate' }], enabled: true },
    { id: 'workspace', label: 'Team name', replacements: [{ match: 'Platform Eng', with: 'The team' }], enabled: true },
  ],
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
    hitCount: 23,
    type: 'investigation',
    title: 'My agent’s “read-only” Postgres login tried to DELETE rows. Here’s how the grants allowed it.',
    tags: ['postgres', 'security', 'ai-agents'],
    summary:
      'Nobody granted DELETE on purpose — it came through ordinary role membership. Checking direct grants would never have shown it.',
    context: 'PostgreSQL 15 · a login provisioned for an AI agent · meant to be read-only',
    sections: [
      {
        heading: 'Problem',
        body: 'I gave an AI agent a Postgres login, `agent_ro`, that was supposed to be read-only. While cleaning up stale test data it ran `DELETE FROM test_runs WHERE created_at < now() - interval \'30 days\'` — and the statement succeeded.',
      },
      {
        heading: 'Investigation',
        kind: 'dead_ends',
        body: [
          '- Checked the table’s grants with `\\dp test_runs` — `agent_ro` only had `SELECT` listed.',
          '- Suspected the agent’s tool had picked up a different connection string. Server logs showed the `DELETE` ran as `agent_ro`.',
          '- Looked for a permissive row-level security policy. RLS wasn’t enabled on the table at all.',
        ].join('\n'),
      },
      {
        heading: 'Root cause',
        body: '`agent_ro` had been granted membership in `analytics`, which was itself a member of `app_writer`. Roles inherit by default, so the login picked up `DELETE` two hops away. A recursive query over `pg_auth_members` showed the full chain — something no single grant listing reveals.',
      },
      {
        heading: 'Solution',
        body: 'Revoked the stray membership, set `NOINHERIT` on the login, and granted `SELECT` directly on the tables the agent needs. Then I wrote `agent-db-scan` to resolve a credential’s effective privileges — ownership, inherited roles, `PUBLIC` grants and default privileges on future objects — and run it in CI before any agent gets a login.',
      },
    ],
    result: { label: 'Tables agent_ro could write to', before: '14', after: '0' },
    lesson: 'Audit what a credential can actually do, not what it was granted directly. Role inheritance makes those two different.',
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

/** A design written in Ledger before it was built; still a proposal. */
export const writeups: Writeup[] = [
  {
    id: 'w_ratelimit',
    type: 'design',
    status: 'proposed',
    title: 'Per-tenant rate limiting at the edge',
    context: 'Envoy edge proxy · Redis 7 · ~40k requests/s at peak',
    symptom:
      'Stop one noisy tenant from degrading the API for everyone, without adding latency to normal requests. Today limits live in each service, so a burst reaches the database before anything says no.',
    constraints: [
      'Under 2 ms added at p99',
      'Limits change without a deploy',
      'Keep working if Redis is briefly unavailable (fail open, alert)',
    ],
    rootCause:
      'Enforce limits in the Envoy edge proxy using the global rate-limit service, backed by the dedicated `noeviction` Redis from LR-190. Limits are keyed by tenant and route group and loaded from a config table the support team can edit.',
    flow: ['Request hits Envoy', 'Rate-limit service checks tenant bucket', 'Redis counters (noeviction)', 'Allowed requests reach services'],
    ruledOut: [
      'Limits inside each service — a burst still costs a database round trip per request.',
      'A CDN rate-limit rule — can’t key on tenant, only IP.',
    ],
    fix: '',
    lesson: '',
    signals: [{ kind: 'alert', value: 'ApiTenantRequestRateHigh' }],
    evidence: [
      {
        key: 'S1',
        kind: 'doc',
        title: 'Doc · docs.google.com',
        detail: 'added by you · link only',
        status: 'linked',
        url: 'https://docs.google.com/document/d/rate-limit-rfc',
        hops: 0,
      },
    ],
    authorId: ME_ID,
    createdAt: '2026-09-25T14:00:00Z',
    updatedAt: '2026-09-27T21:30:00Z',
  },
]

/** Public posts from engineers outside the workspace, for the Explore page. */
export const communityPosts: PublicPost[] = [
  {
    slug: 'retries-turned-a-blip-into-an-outage',
    hitCount: 41,
    authorId: 'u_hannah',
    type: 'incident',
    title: 'Retries turned a 30-second payment provider blip into a 40-minute outage',
    tags: ['payments', 'retries', 'circuit-breaker'],
    summary: 'Every client retried three times with no jitter, so the provider stayed overloaded long after it recovered.',
    context: 'Go services · third-party payment API · ~600 requests/s at peak',
    sections: [
      {
        heading: 'Problem',
        kind: 'text',
        body: 'The payment provider returned 503s for about 30 seconds. Our checkout stayed down for 40 minutes, long after their status page went green.',
      },
      {
        heading: 'Investigation',
        kind: 'dead_ends',
        body: '- Assumed the provider was still degraded — their own dashboard showed normal latency for other customers.\n- Suspected our connection pool was exhausted — pool metrics were healthy the whole time.',
      },
      {
        heading: 'Root cause',
        kind: 'text',
        body: 'Three layers each retried three times with a fixed 1s delay: the SDK, our client wrapper and the job queue. One failed charge became up to 27 requests, all arriving in synchronized waves that kept tripping the provider’s rate limiter.',
      },
      {
        heading: 'Solution',
        kind: 'text',
        body: 'Retries now happen in exactly one layer, with exponential backoff and full jitter. A circuit breaker opens after 20% errors over 10 seconds and sends a single probe request before closing.',
      },
    ],
    result: { label: 'Time to recover from a provider blip', before: '40 min', after: '45 s' },
    lesson: 'Count your retries end to end. Retries at every layer multiply, and without jitter they arrive together.',
    followUps: ['Keep retries in the layer that knows whether the operation is idempotent — here, the job queue, since charges carry an idempotency key there.'],
    badges: [{ label: 'Authored & merged the fix', detail: 'private GitHub project · Aug 2026', verified: true }],
    publishedAt: '2026-08-19T14:00:00Z',
  },
  {
    slug: 'kafka-lag-only-on-mondays',
    hitCount: 17,
    authorId: 'u_tomas',
    type: 'investigation',
    title: 'Kafka consumer lag that only appeared on Monday mornings',
    tags: ['kafka', 'jvm', 'gc'],
    summary: 'A weekly compaction job and a heap sized for weekday traffic combined into long GC pauses every Monday.',
    context: 'Kafka 3.7 · JVM consumers on Kubernetes · 12 partitions',
    sections: [
      {
        heading: 'Problem',
        kind: 'text',
        body: 'Every Monday between 08:00 and 10:00, consumer lag on the orders topic climbed past 2 million messages, then drained by lunch. No deploys or config changes lined up with it.',
      },
      {
        heading: 'Investigation',
        kind: 'dead_ends',
        body: '- Added partitions and consumers — lag moved but didn’t shrink.\n- Blamed the broker — broker CPU and disk were flat during the spikes.',
      },
      {
        heading: 'Root cause',
        kind: 'text',
        body: 'A weekly job re-emitted a week of order updates on Monday mornings. The larger batches pushed consumers into old-generation GC with pauses over 8 seconds, which triggered rebalances, which paused every consumer again.',
      },
      {
        heading: 'Solution',
        kind: 'text',
        body: 'Capped `max.poll.records`, moved to the cooperative sticky assignor so a rebalance doesn’t stop every consumer, and resized the heap from GC logs rather than guesses.',
      },
    ],
    result: { label: 'Peak Monday lag', before: '2.1M messages', after: '18k messages' },
    lesson: 'If a problem follows the calendar, look for a scheduled job before you look at capacity.',
    badges: [{ label: 'Authored & merged the fix', detail: 'private GitLab project · Sep 2026', verified: true }],
    publishedAt: '2026-09-09T09:30:00Z',
  },
  {
    slug: 'partition-events-by-day-not-tenant',
    hitCount: 12,
    authorId: 'u_mei',
    type: 'decision',
    title: 'Partition event tables by day, not by tenant',
    tags: ['postgres', 'partitioning', 'retention'],
    summary: 'Day partitions made retention a metadata operation and kept the partition count predictable.',
    context: 'PostgreSQL 16 · ~3,000 tenants · 90-day retention',
    decision: 'Range-partition the `events` table by day, and add `tenant_id` as the first column of each index instead of partitioning on it.',
    sections: [
      {
        heading: 'Context',
        kind: 'text',
        body: 'Deleting expired events row by row took hours every night and bloated the table. We needed retention to be cheap and query speed to stay flat as tenants grew.',
      },
      {
        heading: 'Options considered',
        kind: 'rejected',
        body: '- Partition by tenant — thousands of partitions, and retention still needs row deletes.\n- Keep one table with a nightly batch delete — the bloat and vacuum load were the problem we started with.',
      },
      {
        heading: 'Consequences',
        kind: 'text',
        body: 'Dropping a day is instant. Queries must include a time range to prune partitions, so we added a lint rule for queries on `events` without one.',
      },
    ],
    lesson: 'Partition along the axis you delete by. Filter along the axis you query by.',
    badges: [{ label: 'Authored & merged the change', detail: 'private GitHub project · Jul 2026', verified: true }],
    publishedAt: '2026-07-30T11:00:00Z',
  },
  {
    slug: 'offline-first-delivery-tracking',
    hitCount: 8,
    authorId: 'u_ade',
    type: 'design',
    title: 'Offline-first delivery tracking for drivers with patchy signal',
    tags: ['mobile', 'sync', 'sqlite'],
    summary: 'Drivers record every scan locally and sync an append-only log, so nothing is lost when signal drops.',
    context: 'Android app · SQLite on device · ~4,000 drivers',
    sections: [
      {
        heading: 'Goal',
        kind: 'text',
        body: 'Let drivers record pickups and drop-offs anywhere, including basements and rural roads, without losing a scan or double-counting one.',
      },
      {
        heading: 'Constraints',
        kind: 'list',
        body: '- Signal can be gone for hours\n- Cheap Android phones with limited storage\n- Dispatch needs updates within a minute of signal returning',
      },
      {
        heading: 'Design',
        kind: 'text',
        body: 'Each scan is written to an append-only log in SQLite with a client-generated ID. A sync worker ships the log in order when there’s signal, and the server deduplicates by ID, so replays are safe.',
      },
      {
        heading: 'Architecture',
        kind: 'flow',
        body: '- Driver scans a parcel\n- Event appended to the local SQLite log\n- Sync worker sends batches when online\n- Server dedupes by event ID and updates dispatch',
      },
      {
        heading: 'Alternatives',
        kind: 'rejected',
        body: '- Sync the current state of each parcel — two offline phones overwrite each other.\n- Block scans until online — drivers stopped scanning and wrote on paper instead.',
      },
      { heading: 'Rollout', kind: 'text', body: 'Piloted with 50 drivers in the worst-coverage region for three weeks, then rolled out city by city.' },
    ],
    result: { label: 'Scans lost per week', before: '~1,200', after: '0' },
    lesson: 'For offline apps, sync events, not state. Events can be replayed; state can only be overwritten.',
    badges: [{ label: 'Authored & merged the implementation', detail: 'private GitHub project · Sep 2026', verified: true }],
    publishedAt: '2026-09-15T16:20:00Z',
  },
]

/** Public questions on posts, keyed by "handle/slug". */
export const publicQuestions: Record<string, PublicQuestion[]> = {
  'engineernamzy/read-only-postgres-login-delete': [
    {
      id: 'pq1',
      askerId: 'u_hannah',
      body: 'Does NOINHERIT break anything if the login still needs a group role for connection limits?',
      at: '2026-09-24T09:10:00Z',
      status: 'answered',
      answer: {
        body: 'Connection limits and `CONNECT` still work. The login just has to `SET ROLE` explicitly to use a group’s table privileges, which is what we wanted.',
        at: '2026-09-24T13:40:00Z',
      },
    },
    {
      id: 'pq2',
      askerId: 'u_mei',
      body: 'Does agent-db-scan check privileges granted through `PUBLIC` on schemas, or only tables?',
      at: '2026-09-27T18:05:00Z',
      status: 'pending',
    },
  ],
  'hannahl/retries-turned-a-blip-into-an-outage': [
    {
      id: 'pq3',
      askerId: 'u_tomas',
      body: 'How did you decide which layer keeps the retries?',
      at: '2026-08-21T10:00:00Z',
      status: 'answered',
      answer: {
        body: 'The layer that knows whether the operation is idempotent. For us that was the job queue, since charges carry an idempotency key there.',
        at: '2026-08-21T15:30:00Z',
      },
      folded: true,
    },
  ],
}

/** Posts the current user has marked "I hit this too". */
export const hitsByMe: string[] = ['hannahl/retries-turned-a-blip-into-an-outage']
