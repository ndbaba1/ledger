FactoryBot.define do
  factory :writeup do
    user
    type { 'incident' }
    title { 'Checkout p99 latency spike' }
    fields do
      {
        'context' => 'PostgreSQL 16 · checkout-api',
        'symptom' => 'p99 went from 310ms to 4.2s at peak.',
        'constraints' => [],
        'rootCause' => 'A config change halved the connection pool.',
        'flow' => [],
        'ruledOut' => ['Scaled read replicas — primary CPU was fine.'],
        'fix' => 'Reverted the change and derived pool size from worker count.',
        'lesson' => 'Alert on waiting clients, not database CPU.',
        'signals' => []
      }
    end

    trait :design do
      type { 'design' }
      status { 'proposed' }
      title { 'Per-tenant rate limiting at the edge' }
    end
  end
end
