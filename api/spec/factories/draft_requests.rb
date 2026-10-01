FactoryBot.define do
  factory :draft_request do
    user
    writeup
    source_url { 'https://github.com/acme/checkout/pull/42' }
    status { 'drafting' }
  end
end
