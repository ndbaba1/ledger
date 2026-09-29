# `github_token` (User) is encrypted at rest. Real deployments must set the
# three ACTIVE_RECORD_ENCRYPTION_* vars (generate with `bin/rails
# db:encryption:init`); development/test fall back to fixed, non-secret keys
# so the app boots without any setup.
if ENV['ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY'].present?
  Rails.application.config.active_record.encryption.primary_key = ENV.fetch('ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY')
  Rails.application.config.active_record.encryption.deterministic_key = ENV.fetch('ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY')
  Rails.application.config.active_record.encryption.key_derivation_salt = ENV.fetch('ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT')
elsif !Rails.env.production?
  Rails.application.config.active_record.encryption.primary_key = 'dev-test-primary-key-not-for-production-use'
  Rails.application.config.active_record.encryption.deterministic_key = 'dev-test-deterministic-key-not-for-prod-use'
  Rails.application.config.active_record.encryption.key_derivation_salt = 'dev-test-key-derivation-salt-not-for-prod-use'
end

# `github_token` already holds real, unencrypted tokens in existing rows —
# let those keep working (as plaintext) instead of failing to decrypt; only
# new writes get encrypted.
Rails.application.config.active_record.encryption.support_unencrypted_data = true
