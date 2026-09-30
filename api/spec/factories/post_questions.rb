FactoryBot.define do
  factory :post_question do
    post
    asker factory: :user
    body { 'What version of Postgres?' }
    status { 'pending' }
  end
end
