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
      get 'explore', to: 'explore#index'

      resources :writeups, only: %i[index create show update] do
        resources :evidence, only: %i[create destroy], param: :key
        resource :status, only: [:update], controller: 'writeup_statuses'
        post :publish, to: 'writeup_publications#create'
      end

      resources :users, only: [:show], param: :handle do
        resources :posts, only: [:show], param: :slug do
          resource :thread, only: [:show], controller: 'post_threads'
          resource :hit, only: [:create], controller: 'post_hits'
        end
      end

      resources :topics, only: [:show], param: :tag
    end
  end
end
