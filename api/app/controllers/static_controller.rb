# Serves the built frontend (web/dist, copied into public/ at image build
# time) for any path the API and auth routes don't claim — now the primary
# way a page loads (BrowserRouter), not just a refresh/deep-link fallback.
# See config/routes.rb and IndexHtmlRenderer for the per-page meta tags.
class StaticController < ActionController::API
  def index
    result = IndexHtmlRenderer.render(request.path)
    render html: result.html.html_safe, status: result.status, content_type: 'text/html'
  end
end
