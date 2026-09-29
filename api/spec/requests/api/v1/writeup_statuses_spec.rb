require 'rails_helper'

RSpec.describe 'PATCH /api/v1/writeups/:id/status', type: :request do
  it 'moves a design between proposed and shipped' do
    user = create(:user)
    sign_in_as(user)
    writeup = create(:writeup, :design, user: user)

    patch_json "/api/v1/writeups/#{writeup.id}/status", params: { status: 'shipped' }

    expect(response).to have_http_status(:ok)
    expect(json['status']).to eq('shipped')
  end

  it 'rejects marking a non-design as shipped' do
    user = create(:user)
    sign_in_as(user)
    writeup = create(:writeup, user: user)

    patch_json "/api/v1/writeups/#{writeup.id}/status", params: { status: 'shipped' }

    expect(response).to have_http_status(:unprocessable_content)
  end
end
