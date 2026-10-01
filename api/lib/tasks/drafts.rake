namespace :drafts do
  desc 'Run the whole "start from a PR or issue" pipeline for a user and print the draft JSON, without saving anything — bin/rails drafts:try[URL,USER_LOGIN]'
  task :try, %i[url user_login] => :environment do |_, args|
    url = args[:url]
    user = User.find_by!(github_login: args[:user_login])
    abort('Usage: bin/rails "drafts:try[https://github.com/owner/repo/pull/1,githublogin]"') if url.blank?

    parsed = GithubEvidenceVerifier.parse_url(url)
    abort("Not a GitHub PR or issue URL: #{url}") unless parsed

    ActiveRecord::Base.transaction do
      writeup = user.writeups.create!(type: 'incident')
      GithubEvidenceVerifier.new(writeup, url, user).call
      evidence = writeup.evidence.last

      if evidence.failure_code.present? || !evidence.verified?
        puts "Not verified: #{evidence.failure_reason || 'unknown reason'}"
        raise ActiveRecord::Rollback
      end

      context = GithubSourceContext.new(writeup, url, user).call
      if context.blank?
        puts 'Not enough in the source to draft from.'
        raise ActiveRecord::Rollback
      end

      result = DraftWriter.new(context: context).call
      puts JSON.pretty_generate(template: result.template, title: result.title, sections: result.sections)

      raise ActiveRecord::Rollback
    end
  end
end
