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
  /** GitHub's avatar image, when there is one. Falls back to initials. */
  avatarUrl?: string
  headline?: string
  location?: string
  stack?: string[]
  previously?: { org: string; summary: string }[]
  /** GitHub always present; website and linkedin are set by the person. */
  links?: { github?: string; website?: string; linkedin?: string }
}

/** Fields a person can edit on their own profile via updateMe(). */
export interface ProfileEdit {
  name?: string
  headline?: string
  location?: string
  stack?: string[]
  links?: { website?: string; linkedin?: string }
}

export interface Workspace {
  id: ID
  name: string
  slug: string
  company: string
  /** Mirrors connected integrations, for the sidebar. */
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
  /** A verified PR (authored & merged, or reviewed & merged) or issue (participated in). */
  verified?: boolean
  /** Why this didn't earn a verification badge, e.g. "Not merged yet." */
  failureReason?: string
  /**
   * Set when `failureReason` is actionable rather than a dead end: the GitHub
   * App isn't installed on the owner at all, or it is but this particular
   * repo isn't shared with it (an installation can be limited to selected
   * repos — and GitHub 404s the same way whether that's why, or the PR/issue
   * itself is just gone, so this code covers both).
   */
  failureCode?: 'app_not_installed' | 'repo_not_in_installation'
  /** A temporary problem re-checking this on republish (expired sign-in, rate limit…) — the previous result still stands. */
  refreshWarning?: string
  /** A GitHub PR/issue behind a private repo. Only the author ever sees its real title — everyone else sees "private GitHub project". */
  private?: boolean
  /** The repo's owner login, when `private` — for "Install Ledger on <owner>" / "Give Ledger access to this repo". */
  owner?: string
  /** Where to send the author to install the app or add this repo to an existing installation, when `failureCode` is set. */
  installUrl?: string
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
  /** Alerts and errors Ledger found in the case file. */
  signals?: Signal[]
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
  /** Alerts, metrics and errors this record is about. Team-only. */
  signals?: Signal[]
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

/** Which of the three ways a piece of evidence earns a badge, independent of write-up type. */
export type EvidenceBadgeType = 'authored_merged' | 'reviewed' | 'participated'

/**
 * One verified PR or issue behind a post, for the grouped "Evidence" rail —
 * grouped client-side by `badgeType`. A private repo's number/title/repo/url
 * are never sent; only that it's private, its kind, and when it happened.
 */
export interface VerifiedEvidenceItem {
  kind: 'github_pr' | 'github_issue'
  badgeType: EvidenceBadgeType
  private?: boolean
  number?: number
  title?: string
  repo?: string
  url?: string
  /** ISO date — the PR's merge date, or the issue's created date. */
  date?: string
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
  /** Unverified evidence only (plain links, a fetched PR/issue that didn't earn a badge) — verified evidence is in `verifiedEvidence` instead, grouped by badge type in the rail. Undefined (rather than empty) on a mock post, which only ever has `badges`. */
  evidence?: Badge[]
  /** Verified PRs/issues, ungrouped — group by `badgeType` to render (see PostScreen). Undefined on a mock post. */
  verifiedEvidence?: VerifiedEvidenceItem[]
  publishedAt: string
  /** Employer line shown on the post, if the author chose to show one. */
  employerLine?: string
  promotedFromRecordId?: ID
  /** How many engineers said they hit this same problem. */
  hitCount?: number
  /** Answers the author folded into the post from public questions. */
  followUps?: FollowUp[]
  /** The write-up this post was published from. Only ever your own. */
  writeupId?: ID
  /** Every republish and folded-in answer, newest first. */
  revisions?: PostRevision[]
}

/** An answer folded into the post, with the question it answered when there was one. */
export interface FollowUp {
  question?: string
  answer: string
  /** Who asked it. Missing on follow-ups folded in before this was tracked. */
  askerId?: ID
}

export interface PostRevision {
  id: ID
  summary: string
  createdAt: string
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

/** A question waiting for me to answer, on one of my own posts. */
export interface PendingQuestion {
  id: ID
  body: string
  at: string
  asker: User
  post: { slug: string; title: string }
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
  /** Bodies of work, pinned above the write-ups. */
  projects: PublicProject[]
  /** Slugs of this person's posts the viewer said they hit too. */
  hitByViewer?: string[]
  /** Verified PRs and the distinct repos they came from, behind this person's published posts. */
  verifiedPRs?: number
  repos?: number
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
  signals: Signal[]
}

/** Where one section's text came from, and what's missing when it's empty — set only on a drafted write-up. */
export interface DraftedSectionMeta {
  sources: string[]
  missing?: string
  /** DraftWriter flagged this section as too long (over ~120 words, or over 5 list items) after one retry. */
  long?: boolean
  /** DraftWriter flagged this section as third-person ("the author"/"the user"/"the engineer") after one retry. */
  voice?: boolean
}

/** Present on a write-up only when it was drafted from a PR or issue via "Start from a PR or issue". Author-only — never appears on a published post. */
export interface DraftedFrom {
  sourceUrl: string
  model?: string
  promptVersion?: string
  draftedAt?: string
  /** The source repo is private — shown as a warning before publishing. */
  private: boolean
  sections: Record<string, DraftedSectionMeta>
}

/** A record written in Ledger rather than drafted from sources. Private until published. */
export interface Writeup extends WriteupFields {
  id: ID
  type: RecordType
  status: WriteupStatus
  evidence: Source[]
  /** The slug of the post this published to, once it has. Publishing again updates that same post. */
  postSlug?: string
  authorId: ID
  createdAt: string
  updatedAt: string
  publishedRecordId?: ID
  draftedFrom?: DraftedFrom
}

export type DraftRequestStatus = 'drafting' | 'ready' | 'failed' | 'needs_template'

/** The async lifecycle of one "start from a PR or issue" attempt — see POST/GET /api/v1/drafts. */
export interface DraftRequest {
  draftId: ID
  status: DraftRequestStatus
  error?: string
  note?: string
  /** Present once a writeup exists — from the first response on, even while still drafting, and kept on failure so the user can continue on it rather than start over. */
  writeupId?: ID
}

/** One post in the public feed, with its author. */
export interface FeedItem {
  post: PublicPost
  author: User
  /** The viewer said they hit this same problem. */
  hitByMe?: boolean
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

export type SignalKind = 'alert' | 'metric' | 'error' | 'log'

/**
 * How a problem shows up from the outside: the alert that fired, the metric
 * that moved, the error people saw. Used to recognise the problem next time.
 * Team-only — never published.
 */
export interface Signal {
  kind: SignalKind
  value: string
  /** Where Ledger found it, e.g. "S1" for a source in the case file. */
  foundIn?: string
}

export interface SignalMatch {
  record: TeamRecord
  signal: Signal
  score: number
  strength: 'exact' | 'strong' | 'partial'
}

export type WorkspaceRole = 'owner' | 'admin' | 'member'
export type IntegrationProvider = 'gitlab' | 'github' | 'slack'

/**
 * A person's membership in a company workspace. The account (`user`) is theirs
 * and outlives the membership; the work email belongs to the membership.
 */
export interface Member {
  user: User
  /** Company email verified when they joined. People invited by username may not have one. */
  workEmail?: string
  role: WorkspaceRole
  joinedAt: string
}

/** Someone who left. Their records stay with the team, still credited to their account. */
export interface FormerMember {
  user: User
  role: WorkspaceRole
  joinedAt: string
  leftAt: string
}

/** Invites go to an existing Ledger account by username, or to an email for people new to Ledger. */
export interface Invite {
  id: ID
  /** Set when invited by username. */
  user?: User
  /** Set when invited by email. */
  email?: string
  role: WorkspaceRole
  invitedById: ID
  sentAt: string
  /** Invites expire after 14 days; resending renews them. */
  expiresAt: string
}

export interface Integration {
  provider: IntegrationProvider
  connected: boolean
  /** What Ledger can see once connected, e.g. "4 projects". */
  detail: string
  /** Slack only: channels Ledger reads threads from and posts matches in. */
  channels?: string[]
}

export interface WorkspacePolicy {
  /** Whether members may promote team records to their public profile. */
  publicPromotion: 'allowed' | 'off'
  /** Every promotion must go through the redaction review, with all rules on by default. */
  requireRedactionReview: boolean
  /** Issue or PR label that turns a closed issue into a draft. */
  triggerLabel: string
}

export interface WorkspaceSettings {
  workspace: Workspace
  myRole: WorkspaceRole
  members: Member[]
  formerMembers: FormerMember[]
  invites: Invite[]
  inviteLink: { token: string; enabled: boolean }
  /** People signing in with an email at this domain can join without an invite. */
  autoJoinDomain: string | null
  integrations: Integration[]
  policy: WorkspacePolicy
}

/** What someone opening an invite link sees before joining. */
export interface InvitePreview {
  workspace: Pick<Workspace, 'name' | 'slug'>
  company: string
  invitedBy: User
  role: WorkspaceRole
  memberCount: number
  recordCount: number
  email?: string
  /** The account the invite was sent to, when invited by username. */
  invitee?: User
  /** They were in this workspace before and are being invited back. */
  rejoining?: boolean
}

export interface InviteResult {
  settings: WorkspaceSettings
  /** Each invitee as typed: `@handle` or an email. */
  sent: string[]
  skipped: { target: string; reason: string }[]
}

// ---- projects: a body of work backed by several records -------------------

export type ProjectRole = 'led' | 'contributed'

/** A merge request or pull request that belongs to a project. */
export interface ProjectChange {
  ref: string
  title: string
  role: 'authored' | 'reviewed'
  mergedAt: string
}

/**
 * Records Ledger noticed belong together (same epic, label or channel).
 * The engineer names it and chooses what to publish.
 */
export interface ProjectCandidate {
  id: ID
  suggestedTitle: string
  /** Why Ledger grouped these, e.g. "epic &14 · Connection pooling". */
  groupedBy: string
  recordIds: ID[]
  changes: ProjectChange[]
  /** Set once published; publishing again updates it. */
  publishedSlug?: string
}

export interface ProjectPlan {
  candidate: ProjectCandidate
  records: TeamRecord[]
  rules: RedactionRule[]
  industryLabel: string
  workspaceName: string
  /** What was published last time, to start from. */
  published?: PublicProject
}

export interface ProjectOptions {
  title: string
  role: ProjectRole
  recordIds: ID[]
  /** Decision and design records to list as key decisions. */
  decisionRecordIds: ID[]
  /** The record whose before → after result is the outcome. */
  outcomeRecordId: ID | null
  enabledRuleIds: ID[]
  employerMode: EmployerMode
}

/** One piece of evidence: a record, public if it was published as a post. */
export interface ProjectRecordRef {
  type: RecordType
  title: string
  postSlug?: string
}

export interface PublicProject {
  slug: string
  authorId: ID
  /** In the engineer’s own words. Everything else is counted or quoted by Ledger. */
  title: string
  role: ProjectRole
  period: { from: string; to: string }
  employerLine?: string
  /** Internal refs are dropped; titles go through the same redaction as posts. */
  changes: { total: number; authored: number; reviewed: number; items: Omit<ProjectChange, 'ref'>[] }
  records: ProjectRecordRef[]
  decisions: ProjectRecordRef[]
  outcome?: ResultMetric & { postSlug?: string }
  tags: string[]
  publishedAt: string
}

export interface ProjectPage {
  project: PublicProject
  author: User
  /** The public posts among the evidence. */
  posts: PublicPost[]
}
