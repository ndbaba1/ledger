# This file loads sample data for development. A production database starts
# empty apart from real users — for a staging site that wants the sample
# posts, run `bin/rails ledger:demo` instead.
if Rails.env.production?
  puts 'Skipping db/seeds.rb in production. Run `bin/rails ledger:demo` if you want the sample posts.'
else
  result = DemoSeeder.call
  puts "Seeded #{result[:users]} users and #{result[:posts]} posts."
end
