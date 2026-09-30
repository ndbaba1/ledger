if Rails.env.test?
  # Sets the session cookie the same way the real GitHub callback does,
  # so request specs can sign in without a live OAuth round trip.
  class TestSignInController < ApplicationController
    def create
      session[:user_id] = params[:user_id]
      head :no_content
    end
  end
end

Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  post '/test/sign_in', to: 'test_sign_in#create' if Rails.env.test?

  get '/auth/:provider/callback', to: 'sessions#create'
  get '/auth/failure', to: 'sessions#failure'

  namespace :api do
    namespace :v1 do
      resource :session, only: [:destroy]
      resource :csrf_token, only: [:show]
      get 'me', to: 'me#show'
      patch 'me', to: 'me#update'
      get 'me/questions', to: 'my_questions#index'
      get 'explore', to: 'explore#index'

      resources :writeups, only: %i[index create show update] do
        resources :evidence, only: %i[create destroy], param: :key do
          member { post :recheck }
        end
        resource :status, only: [:update], controller: 'writeup_statuses'
        post :publish, to: 'writeup_publications#create'
      end

      namespace :github do
        namespace :app do
          get 'setup', to: 'setups#show'
        end
      end

      resources :users, only: [:show], param: :handle do
        resources :posts, only: [:show], param: :slug do
          resource :thread, only: [:show], controller: 'post_threads'
          resource :hit, only: [:create], controller: 'post_hits'
          resources :questions, only: [:create], controller: 'post_questions' do
            member do
              post :answer
              post :dismiss
              post :fold
            end
          end
        end
      end

      resources :topics, only: [:show], param: :tag
    end
  end

  # The SPA's own router (a HashRouter) never sends its routes to the server,
  # but this is a safety net for any other path — everything not already
  # claimed above falls through to index.html and lets the frontend decide.
  get '*path', to: 'static#index', constraints: ->(req) { !req.path.start_with?('/api/', '/auth/') }
end
