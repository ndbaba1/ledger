import type {
  Draft,
  ID,
  OpenCase,
  Profile,
  PromotionPlan,
  PublicPost,
  PublishOptions,
  SearchHit,
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

  listRecords(): Promise<TeamRecord[]>
  getRecord(id: ID): Promise<TeamRecord>
  askQuestion(recordId: ID, body: string): Promise<TeamRecord>
  answerQuestion(recordId: ID, questionId: ID, body: string): Promise<TeamRecord>
  foldAnswer(recordId: ID, questionId: ID): Promise<TeamRecord>

  search(query: string, type?: RecordType): Promise<SearchHit[]>

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
