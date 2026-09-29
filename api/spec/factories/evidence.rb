FactoryBot.define do
  factory :evidence do
    writeup
    sequence(:key) { |n| "S#{n}" }
    kind { 'github_pr' }
    url { 'https://github.com/acme/checkout/pull/42' }
    title { 'GitHub PR #42' }
    status { 'linked' }
  end
end
