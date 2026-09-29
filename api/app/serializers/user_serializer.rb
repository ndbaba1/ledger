module UserSerializer
  # Matches the `User` shape in web/src/api/types.ts.
  def self.call(user)
    {
      id: user.id.to_s,
      name: user.name,
      handle: user.handle,
      initials: user.initials,
      avatarHue: user.avatar_hue,
      avatarUrl: user.avatar_url.presence,
      headline: user.headline.presence,
      location: user.location.presence,
      stack: user.stack,
      links: links_for(user)
    }.compact
  end

  def self.links_for(user)
    { github: user.github_url, website: user.website.presence, linkedin: user.linkedin.presence }.compact
  end
end
