import { useApi } from '../api/ApiContext'
import { Icon } from '../components/Icon'
import { ListBox, ListHeader } from '../components/ListBox'
import { RecordRow } from '../components/RecordRow'
import { Empty, ErrorState, Loading } from '../components/States'
import { stripInline } from '../lib/inline'
import { useQuery } from '../lib/useAsync'
import { useSession } from '../app/session'

export function RecordsScreen() {
  const api = useApi()
  const { workspace } = useSession()
  const records = useQuery(() => api.listRecords(), [api])

  return (
    <div className="page page--narrow">
      <header className="page-head">
        <div>
          <h1 className="page-title">Records</h1>
          <p className="page-sub">Everything {workspace.name} has learned the hard way, newest first.</p>
        </div>
      </header>
      {records.loading && !records.data && <Loading label="Loading records" />}
      {records.error && <ErrorState error={records.error} onRetry={records.reload} />}
      {records.data?.length === 0 && <Empty title="No records yet">Approve a draft from your inbox to publish the first one.</Empty>}
      {records.data && records.data.length > 0 && (
        <ListBox
          labelledBy="records-title"
          header={<ListHeader id="records-title" icon={<Icon name="book" size={16} />} title="Newest first" count={`${records.data.length} records`} />}
        >
          {records.data.map((r) => (
            <RecordRow key={r.id} record={r} excerpt={stripInline(r.lesson || r.symptom)} />
          ))}
        </ListBox>
      )}
    </div>
  )
}
