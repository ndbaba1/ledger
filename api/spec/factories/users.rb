FactoryBot.define do
  factory :user do
    sequence(:github_id)
    sequence(:github_login) { |n| "engineer#{n}" }
    handle { github_login }
    name { 'Nnamdi' }
    initials { 'NN' }
    avatar_hue { 220 }
    github_token { 'gho_test_token' }
  end
end
