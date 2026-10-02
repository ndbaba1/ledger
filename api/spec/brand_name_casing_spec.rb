require 'rails_helper'

# Repo-wide check that the brand name is always written "EngLog" in
# user-facing text (see CLAUDE.md). Lowercase is fine in domains, URLs,
# handles, slugs and code identifiers — see ALLOWED_SUBSTRINGS below for the
# specific ones this codebase actually uses.
RSpec.describe 'Brand name casing' do
  repo_root = Rails.root.join('..')

  SCAN_ROOTS = [
    repo_root.join('web/src'),
    Rails.root.join('app/views'),
    Rails.root.join('app/prompts')
  ].freeze

  SCAN_FILES = [repo_root.join('README.md')].freeze

  # A bare brand mention not immediately followed by the domain suffix or a
  # URL path separator, e.g. "englog" or "Englog" but not "englog.dev" or
  # ".../englog/...".
  WRONG_CASE = /\b(englog|Englog|ENGLOG)\b(?!\.dev|\/)/
  SPACED_OUT = /\beng\s+log\b/i

  # Genuine exceptions: lowercase slugs that mirror an external system's own
  # naming convention (a Slack slash command, a GitHub/GitLab label), not a
  # brand-name typo.
  ALLOWED_SUBSTRINGS = [
    '~englog',
    '/englog track',
    'label englog',
    "triggerLabel: 'englog'"
  ].freeze

  FILES_UNDER = lambda do |dir|
    next [] unless Dir.exist?(dir)

    Dir.glob(dir.join('**', '*')).select { |path| File.file?(path) }
  end

  it 'only ever spells the brand name "EngLog" in user-facing text' do
    files = SCAN_FILES.map(&:to_s) + SCAN_ROOTS.flat_map { |dir| FILES_UNDER.call(dir) }
    files = files.reject { |path| path.include?('/test/') }

    violations = files.flat_map do |path|
      File.readlines(path).each_with_index.filter_map do |line, index|
        next if ALLOWED_SUBSTRINGS.any? { |allowed| line.include?(allowed) }
        next unless line.match?(WRONG_CASE) || line.match?(SPACED_OUT)

        "#{path}:#{index + 1}: #{line.strip}"
      end
    end

    expect(violations).to eq([]), "Brand name must be written \"EngLog\":\n#{violations.join("\n")}"
  end
end
