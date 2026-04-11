import { format, isValid, parseISO } from 'date-fns'

export interface Encounter {
  id: string
  initials: string
  name: string
  age: number
  /** ISO yyyy-MM-dd */
  dob: string
  gender: 'Male' | 'Female' | 'Other'
  when: string
  tag: string
  tagClass: string
  muted?: boolean
  /** ICD-10 codes suggested for this encounter (AI EMR violet group). */
  icdCodes: string[]
  /** CPT codes suggested for this encounter (AI EMR teal group). */
  cptCodes: string[]
}

export function formatEncounterDob(iso: string): string {
  const d = parseISO(iso)
  return isValid(d) ? format(d, 'MM/dd/yyyy') : iso
}

export const MOCK_ENCOUNTERS: Encounter[] = [
  {
    id: '1',
    initials: 'RM',
    name: 'Robert Miller',
    age: 72,
    dob: '1952-08-14',
    gender: 'Male',
    when: 'Today • 09:15 AM',
    tag: 'Clinic',
    tagClass: 'bg-secondary text-secondary-foreground',
    icdCodes: ['I10', 'J06.9'],
    cptCodes: ['99214', '94640'],
  },
  {
    id: '2',
    initials: 'SJ',
    name: 'Sarah Jenkins',
    age: 45,
    dob: '1980-03-22',
    gender: 'Female',
    when: 'Today • 08:30 AM',
    tag: 'Emergency',
    tagClass: 'bg-primary/25 text-foreground',
    icdCodes: ['R50.9', 'R51.9'],
    cptCodes: ['99285', '93010'],
  },
  {
    id: '3',
    initials: 'JW',
    name: 'James Wilson',
    age: 29,
    dob: '1996-11-05',
    gender: 'Male',
    when: 'Yesterday • 04:45 PM',
    tag: 'Follow-up',
    tagClass: 'bg-secondary text-secondary-foreground',
    muted: true,
    icdCodes: ['Z96.653'],
    cptCodes: ['99213'],
  },
  {
    id: '4',
    initials: 'EP',
    name: 'Emily Park',
    age: 38,
    dob: '1987-01-30',
    gender: 'Female',
    when: 'Mon • 02:10 PM',
    tag: 'Telehealth',
    tagClass: 'bg-secondary text-secondary-foreground',
    icdCodes: ['E11.9', 'I10'],
    cptCodes: ['99213', '99421'],
  },
]
