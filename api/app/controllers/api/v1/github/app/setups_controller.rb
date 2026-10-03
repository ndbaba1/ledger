module Api
  module V1
    module Github
      module App
        # GitHub redirects here once someone finishes (or cancels) installing
        # the EngLog GitHub App — the "Setup URL" configured on the app itself.
        # `installation_id`/`setup_action` are GitHub's, but never trusted on
        # their own (see GithubEvidenceVerifier, which always re-asks
        # GithubApp.installation_for); only `state` — signed by us when we sent
        # the person to install — says who this is for.
        class SetupsController < ApplicationController
          def show
            payload = ::GithubApp.verify_setup_state(params[:state])
            return redirect_home unless payload

            if payload['writeup_id']
              redirect_to_writeup(payload)
            elsif payload['draft_url']
              redirect_to "#{app_url}/new?url=#{CGI.escape(payload['draft_url'])}&installed=1", allow_other_host: true
            else
              redirect_home
            end
          end

          private

          def redirect_to_writeup(payload)
            writeup = Writeup.find_by(id: payload['writeup_id'])
            user = User.find_by(id: payload['user_id'])
            reverify_pending_evidence!(writeup, user) if writeup && user

            redirect_to "#{app_url}/write/#{payload['writeup_id']}?installed=1", allow_other_host: true
          end

          def reverify_pending_evidence!(writeup, user)
            writeup.evidence.where(failure_code: Evidence::FAILURE_CODES).find_each do |evidence|
              clear_installation_cache(evidence)
              ::GithubEvidenceVerifier.refresh(evidence, user)
            end
          end

          # The repo name isn't stored on an app_not_installed evidence row
          # (nothing about a private repo is kept beyond what the pasted URL
          # already said) — pull it back out of that URL.
          def repo_of(evidence)
            URI.parse(evidence.url).path.split('/')[2]
          end

          def clear_installation_cache(evidence)
            Rails.cache.delete("github_app/installation/#{evidence.owner}/#{repo_of(evidence)}")
          end

          def redirect_home
            redirect_to app_url, allow_other_host: true
          end

          def app_url
            Rails.application.config.x.app_url
          end
        end
      end
    end
  end
end
