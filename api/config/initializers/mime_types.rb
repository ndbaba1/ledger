# Rack::Static (which serves public/site.webmanifest) looks up content types
# by extension in Rack::Mime, not the Rails Mime::Type registry — without
# this it falls back to text/plain.
Rack::Mime::MIME_TYPES['.webmanifest'] = 'application/manifest+json'
