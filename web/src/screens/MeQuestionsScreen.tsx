import { useApi } from '../api/ApiContext'
import { PublicLayout } from '../app/PublicLayout'
import { useMe } from '../app/session'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { ListBox, ListHeader, ListRow } from '../components/ListBox'
import { Empty, ErrorState, Loading } from '../components/States'
import { relativeTime } from '../lib/format'
import { useQuery } from '../lib/useAsync'

/** Every question waiting for an answer, across all of my posts. */
export function MeQuestionsScreen() {
  const api = useApi()
  const me = useMe()!
  const data = useQuery(() => api.myQuestions(), [api])

  return (
    <PublicLayout>
      <div className="page page--narrow">
        <header className="page-head">
          <div>
            <h1 className="page-title">Questions</h1>
            <p className="page-sub">Public questions readers have asked on your posts, waiting for an answer.</p>
          </div>
        </header>

        {data.error && <ErrorState error={data.error} onRetry={data.reload} />}
        {!data.data && !data.error && <Loading label="Loading questions" />}

        {data.data && (
          <ListBox
            labelledBy="pending-questions"
            header={<ListHeader id="pending-questions" icon={<Icon name="message" size={16} />} title="Waiting for you" count={data.data.length} />}
            footer={
              data.data.length === 0 && (
                <div className="feed__empty">
                  <Empty title="No questions waiting." />
                </div>
              )
            }
          >
            {data.data.map((q) => (
              <ListRow
                key={q.id}
                to={`/u/${me.handle}/${q.post.slug}#q-${q.id}`}
                title={q.body}
                lead={<Avatar user={q.asker} size="sm" />}
                kicker={
                  <>
                    <strong className="text">{q.asker.name}</strong>
                    <span> asked on “{q.post.title}”</span>
                  </>
                }
                meta={<span>Waiting {relativeTime(q.at)}</span>}
              />
            ))}
          </ListBox>
        )}
      </div>
    </PublicLayout>
  )
}
