class AddUniqueIndexOnEvidenceWriteupAndUrl < ActiveRecord::Migration[8.1]
  def change
    add_index :evidence, %i[writeup_id url], unique: true
  end
end
