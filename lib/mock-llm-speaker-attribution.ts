/**
 * Local mock for LLM-based speaker attribution.
 *
 * Classifies each raw STT segment as "Doctor" or "Patient" using
 * heuristic rules (Chinese + English) that mirror what a real LLM prompt
 * would do. Prints a "virtual LLM call" to the console for monitoring
 * and easy swap-out to a real API later.
 *
 * UPGRADE PATH: replace the body of `mockLLMAttributeSpeakers` with a
 * fetch() to your backend without changing any call sites.
 */

export interface RawSegment {
  idx: number
  text: string
  time: string
}

export interface AttributedSegment extends RawSegment {
  speaker: 'Doctor' | 'Patient'
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

// ── Heuristic rule sets ────────────────────────────────────────────────────

const DOCTOR_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Questions (any language)
  { pattern: /[?？]\s*$/, reason: 'question pattern' },
  // Chinese doctor signals
  { pattern: /\b您\b/, reason: 'formal address (Chinese)' },
  { pattern: /有没有|有无/, reason: 'yes/no inquiry (Chinese)' },
  { pattern: /多长时间|多久|什么时候/, reason: 'duration/timing inquiry (Chinese)' },
  { pattern: /告诉我|请描述/, reason: 'request for description (Chinese)' },
  { pattern: /需要|建议|给您|开药|处方/, reason: 'medical instruction (Chinese)' },
  { pattern: /检查|体温|血压|复查|化验|片/, reason: 'medical procedure (Chinese)' },
  { pattern: /我来|让我|我给/, reason: 'doctor action phrase (Chinese)' },
  // English doctor signals
  { pattern: /\b(any|have you|do you|when did|how long|how many)\b/i, reason: 'inquiry phrase (English)' },
  {
    pattern: /\b(i'?ll|let me|i'?m going to|i would like|i need to)\b/i,
    reason: 'doctor action phrase (English)',
  },
  { pattern: /\bprescri|recommend|order\b/i, reason: 'medical instruction (English)' },
  { pattern: /\b(vitals|follow.?up|exam|diagnos|treatment|medic)\b/i, reason: 'medical term (English)' },
  { pattern: /\b(temperature|blood pressure|pulse|oxygen)\b/i, reason: 'vital sign (English)' },
]

const PATIENT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Chinese patient signals — first-person must be at start to avoid "我给您"
  { pattern: /^我/, reason: 'first-person subject (Chinese)' },
  { pattern: /头疼|头痛|头晕|肚子|胸口|背部|腰/, reason: 'body part symptom (Chinese)' },
  { pattern: /发烧|发热|咳嗽|呕吐|恶心|腹泻|疼|痛|不舒服/, reason: 'symptom description (Chinese)' },
  { pattern: /感觉|觉得|好像|大概|应该/, reason: 'subjective feeling (Chinese)' },
  { pattern: /天了|周了|个月了|年了|小时了/, reason: 'duration description (Chinese)' },
  // English patient signals
  { pattern: /\b(i have|i've|i feel|i'?m feeling|i started|i noticed)\b/i, reason: 'first-person symptom (English)' },
  { pattern: /\b(my |mine )/i, reason: 'possessive first-person (English)' },
  { pattern: /\b(headache|stomachache|chest pain|back pain|sore throat|fever|cough|nausea|vomit)\b/i, reason: 'symptom keyword (English)' },
  { pattern: /\b(days?|weeks?|months?)\b.*\b(ago|now|since)\b/i, reason: 'duration phrase (English)' },
  { pattern: /\bhurts?|painful|uncomfortable\b/i, reason: 'pain descriptor (English)' },
]

function scoreSegment(text: string): {
  doctorScore: number
  patientScore: number
  reasons: string[]
} {
  let doctorScore = 0
  let patientScore = 0
  const reasons: string[] = []

  for (const { pattern, reason } of DOCTOR_PATTERNS) {
    if (pattern.test(text)) {
      doctorScore += 1
      reasons.push(`D:${reason}`)
    }
  }
  for (const { pattern, reason } of PATIENT_PATTERNS) {
    if (pattern.test(text)) {
      patientScore += 1
      reasons.push(`P:${reason}`)
    }
  }

  return { doctorScore, patientScore, reasons }
}

function confidenceLevel(winScore: number, loseScore: number): 'high' | 'medium' | 'low' {
  const gap = winScore - loseScore
  if (gap >= 2 || (winScore >= 1 && loseScore === 0)) return 'high'
  if (gap === 1) return 'medium'
  return 'low'
}

// ── Main export ────────────────────────────────────────────────────────────

export function mockLLMAttributeSpeakers(segments: RawSegment[]): AttributedSegment[] {
  if (segments.length === 0) return []

  // First pass: score each segment
  const scored = segments.map((seg) => ({
    ...seg,
    ...scoreSegment(seg.text),
  }))

  const results: AttributedSegment[] = []
  let lastSpeaker: 'Doctor' | 'Patient' = 'Doctor'

  for (let i = 0; i < scored.length; i++) {
    const seg = scored[i]!
    const { doctorScore, patientScore, reasons } = seg

    let speaker: 'Doctor' | 'Patient'
    let confidence: 'high' | 'medium' | 'low'
    let reason: string

    if (doctorScore > patientScore) {
      speaker = 'Doctor'
      confidence = confidenceLevel(doctorScore, patientScore)
      reason = reasons.filter((r) => r.startsWith('D:')).map((r) => r.slice(2)).join(', ')
    } else if (patientScore > doctorScore) {
      speaker = 'Patient'
      confidence = confidenceLevel(patientScore, doctorScore)
      reason = reasons.filter((r) => r.startsWith('P:')).map((r) => r.slice(2)).join(', ')
    } else {
      // Tie or no signal — alternate from last speaker
      speaker = lastSpeaker === 'Doctor' ? 'Patient' : 'Doctor'
      confidence = 'low'
      reason = 'no signal — alternating pattern'
    }

    lastSpeaker = speaker
    results.push({ ...seg, speaker, confidence, reason })
  }

  // ── Console monitor (virtual LLM call log) ────────────────────────────
  /* eslint-disable no-console */
  console.group('%c[MockLLM] Speaker Attribution', 'color: #7c3aed; font-weight: bold')

  console.group('📤 Virtual Prompt (would be sent to GPT-4o / Claude)')
  console.log(
    'System:',
    'You are a medical conversation analyzer. ' +
      'Given a list of raw speech segments from a single-microphone doctor-patient consultation, ' +
      'classify each segment as either "Doctor" or "Patient" based on linguistic patterns, ' +
      'medical vocabulary, sentence structure, and conversational context.',
  )
  console.log(
    'User:',
    'Classify each segment. Return JSON array: [{idx, speaker, confidence, reason}]',
  )
  console.table(segments.map(({ idx, text }) => ({ idx, text })))
  console.groupEnd()

  console.group('📥 Attribution Results')
  console.table(
    results.map(({ idx, text, speaker, confidence, reason }) => ({
      idx,
      speaker,
      confidence,
      reason,
      text: text.length > 50 ? text.slice(0, 50) + '…' : text,
    })),
  )
  console.groupEnd()

  const formattedTranscript = results
    .map((r) => `${r.speaker}: ${r.text}`)
    .join('\n\n')
  console.log('📋 Formatted Transcript:\n', formattedTranscript)
  console.groupEnd()
  /* eslint-enable no-console */

  return results
}

/**
 * Converts AttributedSegment[] to the plain transcript string used by
 * onGenerateEMR: "Doctor: ...\n\nPatient: ..."
 */
export function attributedSegmentsToTranscript(segments: AttributedSegment[]): string {
  return segments.map((s) => `${s.speaker}: ${s.text}`).join('\n\n').trim()
}
