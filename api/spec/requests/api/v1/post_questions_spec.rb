require 'rails_helper'

RSpec.describe 'Public Q&A on a post', type: :request do
  let(:author) { create(:user, handle: 'hannahl') }
  let(:post_record) { create(:post, user: author, title: 'Retries turned a blip into an outage') }
  let(:asker) { create(:user, handle: 'reader1') }
  let(:base) { "/api/v1/users/hannahl/posts/#{post_record.slug}" }

  describe 'POST .../questions (askPublic)' do
    it 'requires sign-in' do
      post_json "#{base}/questions", params: { body: 'What version of Postgres?' }
      expect(response).to have_http_status(:unauthorized)
    end

    it "can't ask a question on your own post" do
      sign_in_as(author)
      post_json "#{base}/questions", params: { body: 'What version of Postgres?' }
      expect(response).to have_http_status(:forbidden)
      expect(json['error']).to match(/own post/)
    end

    it 'asks a question, visible to the author as pending' do
      sign_in_as(asker)
      post_json "#{base}/questions", params: { body: 'What version of Postgres?' }
      expect(response).to have_http_status(:ok)
      expect(json['mine']).to contain_exactly(hash_including('body' => 'What version of Postgres?', 'status' => 'pending'))
      expect(json['askers']).to contain_exactly(hash_including('handle' => 'reader1'))
    end

    it 'rejects a blank question' do
      sign_in_as(asker)
      post_json "#{base}/questions", params: { body: '   ' }
      expect(response).to have_http_status(:unprocessable_content)
    end

    it 'rejects a question over 600 characters' do
      sign_in_as(asker)
      post_json "#{base}/questions", params: { body: 'x' * 601 }
      expect(response).to have_http_status(:unprocessable_content)
    end

    it 'rate-limits to 5 questions per asker per hour, across posts' do
      posts = Array.new(5) { |n| create(:post, user: author, slug: "post-#{n}", title: "Post #{n}") }
      sign_in_as(asker)
      posts.each { |p| post_json "/api/v1/users/hannahl/posts/#{p.slug}/questions", params: { body: 'A question' } }

      sixth = create(:post, user: author, slug: 'post-6', title: 'Post 6')
      post_json "/api/v1/users/hannahl/posts/#{sixth.slug}/questions", params: { body: 'One more' }
      expect(response).to have_http_status(:unprocessable_content)
      expect(json['error']).to match(/already asked|try again/i)
    end

    it 'caps pending questions on a single post at 3, across askers' do
      sign_in_as(asker)
      3.times { |n| post_json "#{base}/questions", params: { body: "Question #{n}" } }

      sign_in_as(create(:user, handle: 'reader2'))
      post_json "#{base}/questions", params: { body: 'One more, please' }
      expect(response).to have_http_status(:unprocessable_content)
      expect(json['error']).to match(/waiting on an answer/)
    end
  end

  describe 'thread visibility' do
    let!(:pending_q) { create(:post_question, post: post_record, asker: asker, body: 'Pending one', status: 'pending') }
    let!(:answered_q) do
      create(:post_question, post: post_record, asker: asker, body: 'Answered one', status: 'answered',
                              answer_body: 'Here you go', answered_at: Time.current)
    end

    it 'readers see only answered questions and their own pending ones' do
      other_reader = create(:user, handle: 'reader3')
      sign_in_as(other_reader)
      get "#{base}/thread"

      ids = json['questions'].map { |q| q['id'] }
      expect(ids).to contain_exactly(answered_q.id.to_s)
      expect(json['mine']).to eq([])
    end

    it "shows the asker their own pending question, but not other readers'" do
      sign_in_as(asker)
      get "#{base}/thread"

      expect(json['mine'].map { |q| q['id'] }).to contain_exactly(pending_q.id.to_s)
    end

    it 'the author sees every pending question, plus answered ones' do
      sign_in_as(author)
      get "#{base}/thread"

      ids = json['questions'].map { |q| q['id'] }
      expect(ids).to contain_exactly(pending_q.id.to_s, answered_q.id.to_s)
    end

    it 'a signed-out visitor sees only answered questions' do
      get "#{base}/thread"
      expect(json['questions'].map { |q| q['id'] }).to contain_exactly(answered_q.id.to_s)
      expect(json['mine']).to eq([])
    end
  end

  describe 'POST .../questions/:id/answer, /dismiss, /fold — author only' do
    let!(:question) { create(:post_question, post: post_record, asker: asker, body: 'What version of Postgres?', status: 'pending') }

    it 'only the author can answer' do
      sign_in_as(asker)
      post_json "#{base}/questions/#{question.id}/answer", params: { body: '16' }
      expect(response).to have_http_status(:forbidden)
    end

    it 'the author answers publicly' do
      sign_in_as(author)
      post_json "#{base}/questions/#{question.id}/answer", params: { body: '16' }
      expect(response).to have_http_status(:ok)
      answered = json['questions'].find { |q| q['id'] == question.id.to_s }
      expect(answered['status']).to eq('answered')
      expect(answered['answer']).to include('body' => '16')
    end

    it 'only the author can dismiss' do
      sign_in_as(asker)
      post_json "#{base}/questions/#{question.id}/dismiss"
      expect(response).to have_http_status(:forbidden)
    end

    it 'the author dismisses a question, and it disappears from the thread entirely' do
      sign_in_as(author)
      post_json "#{base}/questions/#{question.id}/dismiss"
      expect(response).to have_http_status(:ok)
      expect(json['questions'].map { |q| q['id'] }).not_to include(question.id.to_s)
    end

    it "can't fold an unanswered question" do
      sign_in_as(author)
      post_json "#{base}/questions/#{question.id}/fold"
      expect(response).to have_http_status(:unprocessable_content)
    end

    it 'only the author can fold' do
      question.update!(status: 'answered', answer_body: '16', answered_at: Time.current)
      sign_in_as(asker)
      post_json "#{base}/questions/#{question.id}/fold"
      expect(response).to have_http_status(:forbidden)
    end

    it 'folds an answered question into the post, appending a follow-up and a revision' do
      question.update!(status: 'answered', answer_body: '16', answered_at: Time.current)
      sign_in_as(author)

      post_json "#{base}/questions/#{question.id}/fold"

      expect(response).to have_http_status(:ok)
      expect(json['post']['followUps']).to eq(['16'])
      expect(json['thread']['questions'].find { |q| q['id'] == question.id.to_s }['folded']).to eq(true)

      post_record.reload
      expect(post_record.follow_ups).to eq(['16'])
      expect(post_record.revisions.count).to eq(1)
      expect(post_record.revisions.first.summary).to eq('Added a follow-up: What version of Postgres?')
    end

    it 'folding twice does not duplicate the follow-up' do
      question.update!(status: 'answered', answer_body: '16', answered_at: Time.current)
      sign_in_as(author)
      post_json "#{base}/questions/#{question.id}/fold"
      post_json "#{base}/questions/#{question.id}/fold"

      post_record.reload
      expect(post_record.follow_ups).to eq(['16'])
      expect(post_record.revisions.count).to eq(1)
    end
  end
end
