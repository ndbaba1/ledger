# Ported from the community posts in web/src/api/fixtures.ts, so Explore
# isn't empty in development, or on a staging site seeded via `rake
# ledger:demo`. Idempotent — safe to run more than once. Never runs on its
# own in production; see db/seeds.rb.
class DemoSeeder
  USERS = [
    { github_id: 900_001, github_login: 'engineernamzy', handle: 'engineernamzy', name: 'Nnamdi', initials: 'NN',
      avatar_hue: 220, headline: 'Senior backend engineer · building VaultKit', location: 'Toronto',
      stack: %w[go postgres clickhouse rails redis python] },
    { github_id: 900_002, github_login: 'hannahl', handle: 'hannahl', name: 'Hannah L.', initials: 'HL',
      avatar_hue: 330, headline: 'Staff engineer · payments', location: 'Berlin', stack: %w[go postgres kafka] },
    { github_id: 900_003, github_login: 'tomasr', handle: 'tomasr', name: 'Tomás R.', initials: 'TR',
      avatar_hue: 95, headline: 'SRE · streaming platform', location: 'Lisbon', stack: %w[kafka jvm kubernetes] },
    { github_id: 900_004, github_login: 'meiw', handle: 'meiw', name: 'Mei W.', initials: 'MW',
      avatar_hue: 45, headline: 'Data platform engineer', location: 'Singapore', stack: %w[postgres clickhouse python] },
    { github_id: 900_005, github_login: 'adeo', handle: 'adeo', name: 'Ade O.', initials: 'AO',
      avatar_hue: 260, headline: 'Backend engineer · logistics', location: 'Lagos', stack: %w[kotlin sqlite go] },
  ].freeze

  POSTS = [
    {
      handle: 'engineernamzy', slug: 'read-only-postgres-login-delete', type: 'investigation',
      title: 'My agent’s “read-only” Postgres login tried to DELETE rows. Here’s how the grants allowed it.',
      tags: %w[postgres security ai-agents],
      summary: 'Nobody granted DELETE on purpose — it came through ordinary role membership. Checking direct grants would never have shown it.',
      context: 'PostgreSQL 15 · a login provisioned for an AI agent · meant to be read-only',
      sections: [
        { 'heading' => 'Problem', 'kind' => 'text',
          'body' => 'I gave an AI agent a Postgres login, `agent_ro`, that was supposed to be read-only. While cleaning up stale test data it ran `DELETE FROM test_runs WHERE created_at < now() - interval \'30 days\'` — and the statement succeeded.' },
        { 'heading' => 'Investigation', 'kind' => 'dead_ends',
          'body' => "- Checked the table’s grants with `\\dp test_runs` — `agent_ro` only had `SELECT` listed.\n- Suspected the agent’s tool had picked up a different connection string. Server logs showed the `DELETE` ran as `agent_ro`.\n- Looked for a permissive row-level security policy. RLS wasn’t enabled on the table at all." },
        { 'heading' => 'Root cause', 'kind' => 'text',
          'body' => '`agent_ro` had been granted membership in `analytics`, which was itself a member of `app_writer`. Roles inherit by default, so the login picked up `DELETE` two hops away. A recursive query over `pg_auth_members` showed the full chain — something no single grant listing reveals.' },
        { 'heading' => 'Solution', 'kind' => 'text',
          'body' => 'Revoked the stray membership, set `NOINHERIT` on the login, and granted `SELECT` directly on the tables the agent needs. Then I wrote `agent-db-scan` to resolve a credential’s effective privileges — ownership, inherited roles, `PUBLIC` grants and default privileges on future objects — and run it in CI before any agent gets a login.' },
      ],
      result: { 'label' => 'Tables agent_ro could write to', 'before' => '14', 'after' => '0' },
      lesson: 'Audit what a credential can actually do, not what it was granted directly. Role inheritance makes those two different.',
      badges: [{ 'label' => 'Maintainer', 'detail' => 'vaultkit-inc/agent-db-scan', 'verified' => true, 'url' => 'https://github.com/vaultkit-inc/agent-db-scan' }],
      hit_count: 23, published_at: '2026-09-22T16:00:00Z',
    },
    {
      handle: 'hannahl', slug: 'retries-turned-a-blip-into-an-outage', type: 'incident',
      title: 'Retries turned a 30-second payment provider blip into a 40-minute outage',
      tags: %w[payments retries circuit-breaker],
      summary: 'Every client retried three times with no jitter, so the provider stayed overloaded long after it recovered.',
      context: 'Go services · third-party payment API · ~600 requests/s at peak',
      sections: [
        { 'heading' => 'Problem', 'kind' => 'text',
          'body' => 'The payment provider returned 503s for about 30 seconds. Our checkout stayed down for 40 minutes, long after their status page went green.' },
        { 'heading' => 'Investigation', 'kind' => 'dead_ends',
          'body' => "- Assumed the provider was still degraded — their own dashboard showed normal latency for other customers.\n- Suspected our connection pool was exhausted — pool metrics were healthy the whole time." },
        { 'heading' => 'Root cause', 'kind' => 'text',
          'body' => 'Three layers each retried three times with a fixed 1s delay: the SDK, our client wrapper and the job queue. One failed charge became up to 27 requests, all arriving in synchronized waves that kept tripping the provider’s rate limiter.' },
        { 'heading' => 'Solution', 'kind' => 'text',
          'body' => 'Retries now happen in exactly one layer, with exponential backoff and full jitter. A circuit breaker opens after 20% errors over 10 seconds and sends a single probe request before closing.' },
      ],
      result: { 'label' => 'Time to recover from a provider blip', 'before' => '40 min', 'after' => '45 s' },
      lesson: 'Count your retries end to end. Retries at every layer multiply, and without jitter they arrive together.',
      follow_ups: ['Keep retries in the layer that knows whether the operation is idempotent — here, the job queue, since charges carry an idempotency key there.'],
      badges: [{ 'label' => 'Authored & merged the fix', 'detail' => 'private GitHub project · Aug 2026', 'verified' => true }],
      hit_count: 41, published_at: '2026-08-19T14:00:00Z',
    },
    {
      handle: 'tomasr', slug: 'kafka-lag-only-on-mondays', type: 'investigation',
      title: 'Kafka consumer lag that only appeared on Monday mornings',
      tags: %w[kafka jvm gc],
      summary: 'A weekly compaction job and a heap sized for weekday traffic combined into long GC pauses every Monday.',
      context: 'Kafka 3.7 · JVM consumers on Kubernetes · 12 partitions',
      sections: [
        { 'heading' => 'Problem', 'kind' => 'text',
          'body' => 'Every Monday between 08:00 and 10:00, consumer lag on the orders topic climbed past 2 million messages, then drained by lunch. No deploys or config changes lined up with it.' },
        { 'heading' => 'Investigation', 'kind' => 'dead_ends',
          'body' => "- Added partitions and consumers — lag moved but didn’t shrink.\n- Blamed the broker — broker CPU and disk were flat during the spikes." },
        { 'heading' => 'Root cause', 'kind' => 'text',
          'body' => 'A weekly job re-emitted a week of order updates on Monday mornings. The larger batches pushed consumers into old-generation GC with pauses over 8 seconds, which triggered rebalances, which paused every consumer again.' },
        { 'heading' => 'Solution', 'kind' => 'text',
          'body' => 'Capped `max.poll.records`, moved to the cooperative sticky assignor so a rebalance doesn’t stop every consumer, and resized the heap from GC logs rather than guesses.' },
      ],
      result: { 'label' => 'Peak Monday lag', 'before' => '2.1M messages', 'after' => '18k messages' },
      lesson: 'If a problem follows the calendar, look for a scheduled job before you look at capacity.',
      badges: [{ 'label' => 'Authored & merged the fix', 'detail' => 'private GitLab project · Sep 2026', 'verified' => true }],
      hit_count: 17, published_at: '2026-09-09T09:30:00Z',
    },
    {
      handle: 'meiw', slug: 'partition-events-by-day-not-tenant', type: 'decision',
      title: 'Partition event tables by day, not by tenant',
      tags: %w[postgres partitioning retention],
      summary: 'Day partitions made retention a metadata operation and kept the partition count predictable.',
      context: 'PostgreSQL 16 · ~3,000 tenants · 90-day retention',
      decision: 'Range-partition the `events` table by day, and add `tenant_id` as the first column of each index instead of partitioning on it.',
      sections: [
        { 'heading' => 'Context', 'kind' => 'text',
          'body' => 'Deleting expired events row by row took hours every night and bloated the table. We needed retention to be cheap and query speed to stay flat as tenants grew.' },
        { 'heading' => 'Options considered', 'kind' => 'rejected',
          'body' => "- Partition by tenant — thousands of partitions, and retention still needs row deletes.\n- Keep one table with a nightly batch delete — the bloat and vacuum load were the problem we started with." },
        { 'heading' => 'Consequences', 'kind' => 'text',
          'body' => 'Dropping a day is instant. Queries must include a time range to prune partitions, so we added a lint rule for queries on `events` without one.' },
      ],
      lesson: 'Partition along the axis you delete by. Filter along the axis you query by.',
      badges: [{ 'label' => 'Authored & merged the change', 'detail' => 'private GitHub project · Jul 2026', 'verified' => true }],
      hit_count: 12, published_at: '2026-07-30T11:00:00Z',
    },
    {
      handle: 'adeo', slug: 'offline-first-delivery-tracking', type: 'design',
      title: 'Offline-first delivery tracking for drivers with patchy signal',
      tags: %w[mobile sync sqlite],
      summary: 'Drivers record every scan locally and sync an append-only log, so nothing is lost when signal drops.',
      context: 'Android app · SQLite on device · ~4,000 drivers',
      sections: [
        { 'heading' => 'Goal', 'kind' => 'text',
          'body' => 'Let drivers record pickups and drop-offs anywhere, including basements and rural roads, without losing a scan or double-counting one.' },
        { 'heading' => 'Constraints', 'kind' => 'list',
          'body' => "- Signal can be gone for hours\n- Cheap Android phones with limited storage\n- Dispatch needs updates within a minute of signal returning" },
        { 'heading' => 'Design', 'kind' => 'text',
          'body' => 'Each scan is written to an append-only log in SQLite with a client-generated ID. A sync worker ships the log in order when there’s signal, and the server deduplicates by ID, so replays are safe.' },
        { 'heading' => 'Architecture', 'kind' => 'flow',
          'body' => "- Driver scans a parcel\n- Event appended to the local SQLite log\n- Sync worker sends batches when online\n- Server dedupes by event ID and updates dispatch" },
        { 'heading' => 'Alternatives', 'kind' => 'rejected',
          'body' => "- Sync the current state of each parcel — two offline phones overwrite each other.\n- Block scans until online — drivers stopped scanning and wrote on paper instead." },
        { 'heading' => 'Rollout', 'kind' => 'text', 'body' => 'Piloted with 50 drivers in the worst-coverage region for three weeks, then rolled out city by city.' },
      ],
      result: { 'label' => 'Scans lost per week', 'before' => '~1,200', 'after' => '0' },
      lesson: 'For offline apps, sync events, not state. Events can be replayed; state can only be overwritten.',
      badges: [{ 'label' => 'Authored & merged the implementation', 'detail' => 'private GitHub project · Sep 2026', 'verified' => true }],
      hit_count: 8, published_at: '2026-09-15T16:20:00Z',
    },
  ].freeze

  def self.call
    new.call
  end

  def call
    users = seed_users
    seed_posts(users)
    { users: User.count, posts: Post.count }
  end

  private

  def seed_users
    USERS.each_with_object({}) do |attrs, memo|
      user = User.find_or_initialize_by(github_id: attrs[:github_id])
      user.assign_attributes(attrs)
      user.save!
      memo[attrs[:handle]] = user
    end
  end

  def seed_posts(users)
    POSTS.each do |attrs|
      user = users.fetch(attrs[:handle])
      writeup = Writeup.find_or_create_by!(user: user, type: attrs[:type], title: attrs[:title])

      post = Post.find_or_initialize_by(user: user, slug: attrs[:slug])
      post.assign_attributes(
        writeup: writeup, type: attrs[:type], title: attrs[:title], tags: attrs[:tags],
        summary: attrs[:summary], context: attrs[:context], decision: attrs[:decision],
        sections: attrs[:sections], result: attrs[:result], lesson: attrs[:lesson],
        badges: attrs[:badges], follow_ups: attrs[:follow_ups] || [],
        hit_count: attrs[:hit_count], published_at: attrs[:published_at],
      )
      post.save!
    end
  end
end
