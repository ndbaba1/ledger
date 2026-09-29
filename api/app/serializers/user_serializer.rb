module UserSerializer
  # Matches the `User` shape in web/src/api/types.ts.
  def self.call(user)
    {
      id: user.id.to_s,
      name: user.name,
      handle: user.handle,
      initials: user.initials,
      avatarHue: user.avatar_hue,
      headline: user.headline.presence,
      location: user.location.presence,
      stack: user.stack
    }.compact
  end
end
