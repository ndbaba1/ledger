// Domain types shared by every screen. These mirror the shapes the backend
// API is expected to return, so swapping the mock client for an HTTP client
// should not require screen changes.

export type ID = string

export interface User {
  id: ID
  name: string
  handle: string
  initials: string
  /** Avatar background; foreground is derived for contrast. */
  avatarHue: number
  headline?: string
  location?: string
  stack?: string[]
  previously?: { org: string; summary: string }[]
}

export interface Workspace {
  id: ID
  name: string
  slug: string
  connections: { provider: 'gitlab' | 'github' | 'slack'; label: string }[]
}

export type RecordType = 'incident' | 'investigation' | 'decision' | 'design'

export type SourceKind =
  | 'slack'
  | 'gitlab_issue'
  | 'gitlab_mr'
  | 'github_issue'
  | 'github_pr'
  | 'doc'
  | 'link'

export type SourceStatus = 'fetched' | 'linked' | 'pasted' | 'failed'

/** What Ledger quotes from a source: diff lines from a PR/MR, or messages from a thread. */
export type SourceExcerpt =
  | { kind: 'diff'; file: string; lines: { op: '+' | '-' | ' '; text: string }[] }
  | { kind: 'quotes'; quotes: string[] }

export interface Source {
  /** Citation key used inline in text, e.g. "S3". */
  key: string
  kind: SourceKind
  title: string
  detail: string
  status: SourceStatus
  url?: string
  /** Links followed from the anchor to reach this source. 0 = the anchor. */
  hops: number
  /** The current user authored this artifact (used for verification badges). */
  authoredByMe?: boolean
  excerpt?: SourceExcerpt
}

export type TimelineKind = 'step' | 'dead_end' | 'fix'

export interface TimelineEntry {
  at: string
  kind: TimelineKind
  /** May contain `code` spans and [S1] citations. */
  text: string
}

export type GapKind = 'missing_context' | 'unsupported_claim'
export type GapStatus = 'open' | 'answered' | 'kept_unverified' | 'removed'

export interface Gap {
  id: ID
  kind: GapKind
  prompt: string
  status: GapStatus
  answer?: string
}

export interface Redaction {
  label: string
  count: number
}

export type DraftStatus = 'needs_review' | 'published'

export interface Draft {
  id: ID
  slug: string
  type: RecordType
  title: string
  service: string
  severity?: string
  resolvedIn?: string
  anchor: string
  trigger: string
  createdAt: string
  summary: string
  rootCause: string
  fix: string
  timeline: TimelineEntry[]
  gaps: Gap[]
  sources: Source[]
  redactions: Redaction[]
  coAuthorIds: ID[]
  status: DraftStatus
  publishedRecordId?: ID
}

export interface Answer {
  authorId: ID
  body: string
  at: string
}

export interface Question {
  id: ID
  authorId: ID
  authorRole: string
  body: string
  at: string
  answer?: Answer
  folded?: boolean
}

export interface HistoryEntry {
  at: string
  byId: ID
  summary: string
}

export interface TeamRecord {
  id: ID
  type: RecordType
  title: string
  tags: string[]
  authorIds: ID[]
  publishedAt: string
  symptom: string
  rootCause: string
  ruledOut: string[]
  detection?: { language: string; code: string }
  fix: string
  lesson: string
  /** Environment line: versions, scale, the job involved. */
  context?: string
  result?: ResultMetric
  /** Designs: the limits the design had to work within. */
  constraints?: string[]
  /** Designs: the main path through the system, one component per step. */
  flow?: string[]
  /** Answers folded in from Q&A threads. */
  notes: string[]
  sources: Source[]
  questions: Question[]
  history: HistoryEntry[]
  relatedIds: ID[]
  promotedPostSlug?: string
}

export interface OpenCase {
  id: ID
  title: string
  anchor: string
  openedVia: string
  openedAt: string
  sourceCount: number
  ownerId: ID
}

export interface Badge {
  label: string
  detail?: string
  verified: boolean
  url?: string
}

/**
 * How a section renders: running text, a plain list, or a numbered list of
 * dead ends / rejected options. List bodies hold one "- " item per line.
 */
export type PostSectionKind = 'text' | 'list' | 'dead_ends' | 'rejected' | 'flow'

export interface PostSection {
  heading: string
  body: string
  kind?: PostSectionKind
}

/** A before/after measurement, e.g. "Query time: 1.6s → 40ms". */
export interface ResultMetric {
  label: string
  before: string
  after: string
}

export interface PublicPost {
  slug: string
  authorId: ID
  type: RecordType
  title: string
  tags: string[]
  summary: string
  /** Environment line: versions, scale, the job involved. */
  context?: string
  /** For decisions: what was decided, shown up top. */
  decision?: string
  sections: PostSection[]
  result?: ResultMetric
  lesson?: string
  badges: Badge[]
  publishedAt: string
  /** Employer line shown on the post, if the author chose to show one. */
  employerLine?: string
  promotedFromRecordId?: ID
  /** How many engineers said they hit this same problem. */
  hitCount?: number
  /** Answers the author folded into the post from public questions. */
  followUps?: string[]
}

export type PublicQuestionStatus = 'pending' | 'answered' | 'dismissed'

/** A question a reader asked on a public post. Shown publicly only once answered. */
export interface PublicQuestion {
  id: ID
  askerId: ID
  body: string
  at: string
  status: PublicQuestionStatus
  answer?: { body: string; at: string }
  folded?: boolean
}

/** What a reader sees of a post's Q&A; the author also sees pending questions. */
export interface PostThread {
  questions: PublicQuestion[]
  askers: User[]
  /** The viewer's own questions still waiting for the author. */
  mine: PublicQuestion[]
  hitCount: number
  hitByMe: boolean
}

export interface TopicPage {
  tag: string
  items: FeedItem[]
  /** Tags that often appear with this one. */
  related: { tag: string; count: number }[]
  totalHits: number
}

export interface RedactionRule {
  id: ID
  label: string
  /** Exact strings to find and what to put instead. Empty replacement = removed. */
  replacements: { match: string; with: string }[]
  enabled: boolean
}

export type EmployerMode = 'hidden' | 'industry' | 'named'

export interface PromotionPlan {
  recordId: ID
  slug: string
  rules: RedactionRule[]
  industryLabel: string
  workspaceName: string
  evidence: { source: Source; becomes: Badge | null }[]
}

export interface PublishOptions {
  enabledRuleIds: ID[]
  employerMode: EmployerMode
}

export interface SearchHit {
  record: TeamRecord
  /** Short excerpt around the match. */
  excerpt: string
}

export interface Profile {
  user: User
  posts: PublicPost[]
}

/** A synthesized answer to a question, citing team records as [1], [2]… */
export interface AskAnswer {
  question: string
  /** Null when no record covers the question. */
  answer: string | null
  citations: { n: number; recordId: ID; title: string }[]
}

/** Where a hand-written write-up is: a working draft, a design proposal, or a design that has shipped. */
export type WriteupStatus = 'draft' | 'proposed' | 'shipped'

/** The fields a person fills in when writing a record by hand. */
export interface WriteupFields {
  title: string
  context: string
  symptom: string
  constraints: string[]
  rootCause: string
  flow: string[]
  ruledOut: string[]
  fix: string
  lesson: string
  result?: ResultMetric
}

/** A record written in Ledger rather than drafted from sources. Private until published. */
export interface Writeup extends WriteupFields {
  id: ID
  type: RecordType
  status: WriteupStatus
  evidence: Source[]
  authorId: ID
  createdAt: string
  updatedAt: string
  publishedRecordId?: ID
}

/** One post in the public feed, with its author. */
export interface FeedItem {
  post: PublicPost
  author: User
}

export interface ExploreParams {
  query?: string
  type?: RecordType
  tag?: string
}

export interface ExploreResult {
  items: FeedItem[]
  /** Most-used tags across all public posts, for browsing. */
  tags: { tag: string; count: number }[]
  /** Public posts in total, before filters. */
  total: number
}
