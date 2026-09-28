import type {
  Draft,
  ID,
  OpenCase,
  Profile,
  PromotionPlan,
  PublicPost,
  PublishOptions,
  SearchHit,
  AskAnswer,
  Writeup,
  WriteupFields,
  WriteupStatus,
  RecordType,
  TeamRecord,
  User,
  Workspace,
} from './types'

/**
 * Everything the UI needs from the backend. The app talks only to this
 * interface; `createMockApi` implements it in memory today, and an HTTP
 * client can implement it later without touching the screens.
 */
export interface LedgerApi {
  me(): Promise<User>
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
  setWriteupStatus(id: ID, status: WriteupStatus): Promise<Writeup>
  /** Fails with the list of what's missing when the write-up isn't ready. */
  publishWriteup(id: ID): Promise<TeamRecord>

  listRecords(): Promise<TeamRecord[]>
  getRecord(id: ID): Promise<TeamRecord>
  askQuestion(recordId: ID, body: string): Promise<TeamRecord>
  answerQuestion(recordId: ID, questionId: ID, body: string): Promise<TeamRecord>
  foldAnswer(recordId: ID, questionId: ID): Promise<TeamRecord>

  search(query: string, type?: RecordType): Promise<SearchHit[]>
  /** Answer a question from team records only, citing each record used. */
  ask(question: string): Promise<AskAnswer>

  getPromotionPlan(recordId: ID): Promise<PromotionPlan>
  publishPost(recordId: ID, options: PublishOptions): Promise<PublicPost>

  getProfile(handle: string): Promise<Profile>
  getPost(handle: string, slug: string): Promise<{ post: PublicPost; author: User }>
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`)
    this.name = 'NotFoundError'
  }
}
