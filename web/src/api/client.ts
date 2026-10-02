import type {
  Draft,
  DraftRequest,
  ID,
  OpenCase,
  Profile,
  PromotionPlan,
  PublicPost,
  PublishOptions,
  SearchHit,
  AskAnswer,
  Writeup,
  WorkspaceSettings,
  WorkspaceRole,
  InviteResult,
  IntegrationProvider,
  WorkspacePolicy,
  InvitePreview,
  SignalMatch,
  PostThread,
  PendingQuestion,
  TopicPage,
  ExploreParams,
  ExploreResult,
  WriteupFields,
  WriteupStatus,
  RecordType,
  TeamRecord,
  User,
  ProjectCandidate,
  ProjectOptions,
  ProjectPage,
  ProjectPlan,
  ProfileEdit,
  PublicProject,
  Workspace,
} from './types'

/**
 * Everything the UI needs from the backend. The app talks only to this
 * interface; `createMockApi` implements it in memory today, and an HTTP
 * client can implement it later without touching the screens.
 */
export interface LedgerApi {
  me(): Promise<User>
  /** Updates the signed-in user's own editable profile fields. */
  updateMe(patch: ProfileEdit): Promise<User>
  workspace(): Promise<Workspace>
  users(ids: ID[]): Promise<User[]>

  listDrafts(): Promise<Draft[]>
  getDraft(id: ID): Promise<Draft>
  answerGap(draftId: ID, gapId: ID, answer: string): Promise<Draft>
  keepGapUnverified(draftId: ID, gapId: ID): Promise<Draft>
  removeGapClaim(draftId: ID, gapId: ID): Promise<Draft>
  reopenGap(draftId: ID, gapId: ID): Promise<Draft>
  addSource(draftId: ID, url: string): Promise<Draft>
  approveDraft(draftId: ID): Promise<TeamRecord>

  listCases(): Promise<OpenCase[]>

  /** Hand-written records: drafts, design proposals and shipped designs not yet published. */
  listWriteups(): Promise<Writeup[]>
  createWriteup(type: RecordType): Promise<Writeup>
  getWriteup(id: ID): Promise<Writeup>
  saveWriteup(id: ID, fields: Partial<WriteupFields>): Promise<Writeup>
  addWriteupEvidence(id: ID, url: string): Promise<Writeup>
  removeWriteupEvidence(id: ID, key: string): Promise<Writeup>
  /** Re-runs verification for one piece of evidence in place — e.g. after installing the GitHub App. */
  recheckWriteupEvidence(id: ID, key: string): Promise<Writeup>
  setWriteupStatus(id: ID, status: WriteupStatus): Promise<Writeup>
  /**
   * Deletes a draft (never-published) write-up and its evidence for good.
   * Rejects with a message to show inline: a published (or ever-published)
   * write-up can't be deleted here, and one a DraftRequest is still actively
   * drafting can't be deleted until that finishes.
   */
  deleteWriteup(id: ID): Promise<void>
  /** Fails with the list of what's missing when the write-up isn't ready. */
  publishWriteup(id: ID): Promise<TeamRecord>
  /**
   * Publishes straight to the author's public profile, or — once it already
   * has a post — republishes to that same post. `summary` is the required
   * one-line "What changed?" note on a republish; ignored the first time.
   */
  publishWriteupToProfile(id: ID, summary?: string): Promise<PublicPost>

  /**
   * Starts drafting a write-up from a GitHub PR or issue URL — see "Start
   * from a PR or issue" on the New write-up page. Resolves immediately with
   * `status: 'ready'` for an empty source once a template is known, or
   * `status: 'drafting'` to poll via getDraftRequest. Rejects with
   * DraftBlockedError for every other outcome (needs_template,
   * consent_required, the verification gate, or the daily cap).
   */
  startDraftFromSource(url: string, template?: RecordType): Promise<DraftRequest>
  getDraftRequest(id: ID): Promise<DraftRequest>
  /** Consent to send a private repo's PR/issue title, body and comments to Anthropic for drafting. */
  acceptPrivateDraftingConsent(): Promise<void>

  listRecords(): Promise<TeamRecord[]>
  getRecord(id: ID): Promise<TeamRecord>
  askQuestion(recordId: ID, body: string): Promise<TeamRecord>
  answerQuestion(recordId: ID, questionId: ID, body: string): Promise<TeamRecord>
  foldAnswer(recordId: ID, questionId: ID): Promise<TeamRecord>

  search(query: string, type?: RecordType): Promise<SearchHit[]>
  /** Answer a question from team records only, citing each record used. */
  ask(question: string): Promise<AskAnswer>
  /** Records whose alerts, metrics or errors match a pasted alert or error. */
  matchSignal(text: string): Promise<SignalMatch[]>

  getPromotionPlan(recordId: ID): Promise<PromotionPlan>
  publishPost(recordId: ID, options: PublishOptions): Promise<PublicPost>

  /** Every public post from every engineer, searchable and filterable. No sign-in needed. */
  explore(params: ExploreParams): Promise<ExploreResult>

  /** Workspace admin. Owners and admins can change things; members can only read. */
  getWorkspaceSettings(): Promise<WorkspaceSettings>
  /** Each target is a Ledger username (`@handle`) or an email address. */
  inviteMembers(targets: string[], role: WorkspaceRole): Promise<InviteResult>
  /** Ledger accounts whose username or name starts with the query, for @-mention style invites. */
  findUsers(query: string): Promise<User[]>
  resendInvite(inviteId: ID): Promise<WorkspaceSettings>
  revokeInvite(inviteId: ID): Promise<WorkspaceSettings>
  changeRole(userId: ID, role: WorkspaceRole): Promise<WorkspaceSettings>
  removeMember(userId: ID): Promise<WorkspaceSettings>
  setInviteLink(enabled: boolean, reset?: boolean): Promise<WorkspaceSettings>
  setAutoJoinDomain(domain: string | null): Promise<WorkspaceSettings>
  setIntegration(provider: IntegrationProvider, connected: boolean): Promise<WorkspaceSettings>
  updatePolicy(patch: Partial<WorkspacePolicy>): Promise<WorkspaceSettings>
  /** Public: what an invite link leads to. */
  previewInvite(token: string): Promise<InvitePreview>
  acceptInvite(token: string): Promise<Workspace>

  getProfile(handle: string): Promise<Profile>
  getProject(handle: string, slug: string): Promise<ProjectPage>

  /** Groups of records Ledger thinks are one project, for the current user. */
  listProjectCandidates(): Promise<ProjectCandidate[]>
  getProjectPlan(candidateId: ID): Promise<ProjectPlan>
  publishProject(candidateId: ID, options: ProjectOptions): Promise<PublicProject>
  getPost(handle: string, slug: string): Promise<{ post: PublicPost; author: User }>

  /** Public Q&A and "I hit this too" for a post, as the current viewer sees them. */
  getThread(handle: string, slug: string): Promise<PostThread>
  askPublic(handle: string, slug: string, body: string): Promise<PostThread>
  /** Author only: answer, dismiss, or fold an answer into the post. */
  answerPublic(handle: string, slug: string, questionId: ID, body: string): Promise<PostThread>
  dismissPublic(handle: string, slug: string, questionId: ID): Promise<PostThread>
  /** `edits` lets the author reword the question/answer before it's added; the thread itself keeps the originals. */
  foldPublic(
    handle: string,
    slug: string,
    questionId: ID,
    edits?: { question: string; answer: string },
  ): Promise<{ thread: PostThread; post: PublicPost }>
  /** Toggles the viewer's "I hit this too". */
  toggleHit(handle: string, slug: string): Promise<PostThread>

  /** Pending questions on my own posts, oldest first — for the header badge and /me/questions. */
  myQuestions(): Promise<PendingQuestion[]>

  getTopic(tag: string): Promise<TopicPage>
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`)
    this.name = 'NotFoundError'
  }
}

/** Thrown by `me()` when the visitor is signed out. The frontend treats this as expected, not fatal. */
export class UnauthorizedError extends Error {
  constructor(message = 'Sign in to continue.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Thrown by `startDraftFromSource` for every non-2xx response. `code`
 * distinguishes the two outcomes the UI reacts to specially — everything
 * else (the verification gate's message, a temporary GitHub failure) is a
 * plain inline error, read from `message`.
 */
export class DraftBlockedError extends Error {
  code?: 'consent_required' | 'needs_template'
  note?: string
  failureCode?: 'app_not_installed' | 'repo_not_in_installation'
  installUrl?: string
  /** Set on a 429: when the daily cap resets. */
  resetAt?: string

  constructor(body: { error?: string; code?: string; note?: string; failureCode?: string; installUrl?: string; resetAt?: string }) {
    super(body.error ?? body.note ?? 'Could not start drafting.')
    this.name = 'DraftBlockedError'
    this.code = body.code as DraftBlockedError['code']
    this.note = body.note
    this.failureCode = body.failureCode as DraftBlockedError['failureCode']
    this.installUrl = body.installUrl
    this.resetAt = body.resetAt
  }
}
