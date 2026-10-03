# The SPA-fallback and static-asset specs need the real built frontend under
# public/ — the same thing the Docker image gets via `COPY --from=frontend`
# (see api/Dockerfile). Build it once per suite run if it isn't already
# there; assumes web/node_modules is already installed (same precondition
# as `bundle install` on this side).
RSpec.configure do |config|
  config.before(:suite) do
    static_index = Rails.root.join('app/views/static/index.html')
    next if static_index.exist?

    web_dir = Rails.root.join('..', 'web')
    system('npm', 'run', 'build', chdir: web_dir.to_s, exception: true)
    FileUtils.cp_r(Dir.glob(web_dir.join('dist', '*').to_s), Rails.public_path.to_s)
    # Not public/index.html — see IndexHtmlRenderer for why.
    FileUtils.mv(Rails.public_path.join('index.html').to_s, static_index.to_s)
  end
end
