# Redirect the bare www and the old Render host to the canonical domain,
# ahead of everything else so the extra hosts never reach session/auth
# middleware. See app/middleware/canonical_host_redirect.rb.
#
# `require`d explicitly (rather than relying on autoloading) because this
# runs while config/initializers are loading, before Zeitwerk has registered
# app/middleware as an autoload path.
require Rails.root.join('app/middleware/canonical_host_redirect')

Rails.application.config.middleware.insert_before 0, CanonicalHostRedirect
