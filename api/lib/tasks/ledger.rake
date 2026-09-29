namespace :ledger do
  desc 'Load the sample users and posts (including in production) — for a staging environment, e.g. `bin/rails ledger:demo`'
  task demo: :environment do
    result = DemoSeeder.call
    puts "Seeded #{result[:users]} users and #{result[:posts]} posts."
  end
end
