import type { RecordType, TimelineKind } from '../api/types'

export interface SectionLabels {
  summary: string
  timeline: string
  symptom: string
  ruledOut: string
  rootCause: string
  fix: string
}

export const SECTION_LABELS: Record<RecordType, SectionLabels> = {
  incident: {
    summary: 'Summary',
    timeline: 'Investigation timeline',
    symptom: 'What happened',
    ruledOut: 'What we ruled out',
    rootCause: 'Root cause',
    fix: 'Fix',
  },
  investigation: {
    summary: 'Summary',
    timeline: 'Investigation timeline',
    symptom: 'What happened',
    ruledOut: 'Dead ends',
    rootCause: 'Root cause',
    fix: 'Fix',
  },
  decision: {
    summary: 'Context',
    timeline: 'Options considered',
    symptom: 'Context',
    ruledOut: 'Options rejected',
    rootCause: 'Decision',
    fix: 'Consequences',
  },
  design: {
    summary: 'Goal',
    timeline: 'Design trail',
    symptom: 'Goal',
    ruledOut: 'Alternatives',
    rootCause: 'Design',
    fix: 'Rollout',
  },
}

export const TIMELINE_MARK: Record<TimelineKind, { label: string; tone: string } | null> = {
  step: null,
  dead_end: { label: 'Dead end', tone: 'red' },
  fix: { label: 'Fix', tone: 'green' },
}
