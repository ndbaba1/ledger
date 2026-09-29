FactoryBot.define do
  factory :post do
    user
    writeup { association(:writeup, user: user) }
    sequence(:slug) { |n| "checkout-p99-latency-#{n}" }
    type { 'incident' }
    title { 'Checkout p99 latency spike' }
    summary { 'A config change halved the connection pool.' }
    sections { [{ 'heading' => 'Problem', 'body' => 'p99 went from 310ms to 4.2s.', 'kind' => 'text' }] }
    tags { ['postgres'] }
    badges { [] }
    published_at { Time.current }
  end
end
