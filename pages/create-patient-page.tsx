import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CreatePatientPayload } from '@/lib/patient-api'
import { toast } from 'sonner'

const MM_DD_YYYY_RE = /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})$/
const YYYY_MM_DD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function normalizeDobForApi(raw: string): string | null {
  const v = raw.trim()
  const slashMatch = MM_DD_YYYY_RE.exec(v)
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0')
    const day = slashMatch[2].padStart(2, '0')
    const year = slashMatch[3]
    return `${year}-${month}-${day}`
  }
  if (YYYY_MM_DD_RE.test(v)) {
    return v
  }
  return null
}

export interface CreatePatientPageProps {
  onCancel: () => void
  onSave: (payload: CreatePatientPayload) => void
  isSaving: boolean
}

export function CreatePatientPage({ onCancel, onSave, isSaving }: CreatePatientPageProps) {
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [dateOfBirth, setDateOfBirth] = React.useState('')
  const [gender, setGender] = React.useState<'Male' | 'Female' | 'Other' | ''>('')
  const [clinicPatientId, setClinicPatientId] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const missing: string[] = []
    if (!firstName.trim()) missing.push('first name')
    if (!lastName.trim()) missing.push('last name')
    if (!dateOfBirth.trim()) missing.push('date of birth')
    if (!gender) missing.push('gender')
    if (missing.length > 0) {
      toast.warning(`Please enter ${missing.join(', ')}.`)
      return
    }
    if (gender !== 'Male' && gender !== 'Female' && gender !== 'Other') {
      toast.warning('Please select a gender.')
      return
    }
    const normalizedDob = normalizeDobForApi(dateOfBirth)
    if (!normalizedDob) {
      toast.warning('Date of birth must be YYYY-MM-DD or MM/DD/YYYY.')
      return
    }
    const payload: CreatePatientPayload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      date_of_birth: normalizedDob,
      gender,
    }
    const cpid = clinicPatientId.trim()
    if (cpid) {
      payload.clinic_patient_id = cpid
    }
    const emailTrim = email.trim()
    const phoneTrim = phone.trim()
    if (emailTrim) payload.email = emailTrim
    if (phoneTrim) payload.phone = phoneTrim
    onSave(payload)
  }

  return (
    <ScrollArea className="h-full min-h-0 bg-background">
      <form onSubmit={handleSubmit} className="space-y-5 px-4 py-4 pb-28">
        <div className="space-y-2">
          <Label htmlFor="create-patient-first">First name</Label>
          <Input
            id="create-patient-first"
            autoComplete="given-name"
            value={firstName}
            onChange={(ev) => setFirstName(ev.target.value)}
            disabled={isSaving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-patient-last">Last name</Label>
          <Input
            id="create-patient-last"
            autoComplete="family-name"
            value={lastName}
            onChange={(ev) => setLastName(ev.target.value)}
            disabled={isSaving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-patient-dob">Date of birth</Label>
          <Input
            id="create-patient-dob"
            placeholder="YYYY-MM-DD or MM/DD/YYYY"
            value={dateOfBirth}
            onChange={(ev) => setDateOfBirth(ev.target.value)}
            disabled={isSaving}
          />
        </div>
        <div className="space-y-2">
          <Label>Gender</Label>
          <Select
            value={gender || undefined}
            onValueChange={(v) => setGender(v as 'Male' | 'Female' | 'Other')}
            disabled={isSaving}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-patient-cpid">Clinic patient ID (optional)</Label>
          <Input
            id="create-patient-cpid"
            value={clinicPatientId}
            onChange={(ev) => setClinicPatientId(ev.target.value)}
            disabled={isSaving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-patient-email">Email (optional)</Label>
          <Input
            id="create-patient-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            disabled={isSaving}
          />
          <p className="text-xs text-muted-foreground">
            If provided with date of birth, used to detect an existing patient in your clinic.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-patient-phone">Phone (optional)</Label>
          <Input
            id="create-patient-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(ev) => setPhone(ev.target.value)}
            disabled={isSaving}
          />
        </div>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </ScrollArea>
  )
}
