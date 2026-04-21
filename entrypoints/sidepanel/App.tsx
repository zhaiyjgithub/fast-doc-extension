import * as React from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { TopBar } from '@/components/layout/top-bar'
import { BottomNav, type NavTab } from '@/components/layout/bottom-nav'
import { LoginForm } from '@/components/auth/login-form'
import { PatientSearchSheet } from '@/components/patient/patient-search-sheet'
import type { Patient } from '@/components/patient/patient-search-sheet'
import { HomePage } from '@/pages/home-page'
import { NotesPage } from '@/pages/notes-page'
import { RecordingPage } from '@/pages/recording-page'
import { SoapPage } from '@/pages/soap-page'
import { SoapGeneratingPage } from '@/pages/soap-generating-page'
import { TranscriptPage } from '@/pages/transcript-page'
import { PatientDemographicPage } from '@/pages/patient-demographic-page'
import { ProviderPage } from '@/pages/provider-page'
import { SettingsPage } from '@/pages/settings-page'
import {
  AuthApiError,
  fetchCurrentUser,
  loginWithPassword,
  logoutProvider,
  refreshProviderToken,
} from '@/lib/auth-api'
import { clearAuthSession, loadAuthSession, saveAuthSession } from '@/lib/auth-session'
import { fetchProviderProfile } from '@/lib/provider-api'
import {
  createEncounter,
  EncounterApiError,
  getEncounter,
  listEncounters,
  type EncounterSummary,
} from '@/lib/encounter-api'
import { EmrApiError, generateEmr, pollEmrTask, type EmrTaskSubmitted } from '@/lib/emr-api'
import { ReportApiError, getEncounterReport, type EncounterReport } from '@/lib/report-api'
import {
  clearPersistedProviderProfile,
  loadPersistedProviderProfile,
  savePersistedProviderProfile,
} from '@/lib/provider-session'
import { getProviderProfile, providerDisplayName, type ProviderProfile } from '@/lib/mock-provider'
import { getDemographicByEncounterId } from '@/lib/patient-demographic'
import { PatientApiError, parseDemographicsTextWithLlm } from '@/lib/patient-api'
import { Home, FileText, Mic, Settings } from 'lucide-react'
import { toast } from 'sonner'

type AppPage =
  | 'home'
  | 'notes'
  | 'recording'
  | 'soap'
  | 'transcript'
  | 'settings'
  | 'patient-demographic'
  | 'provider'
type SoapFlowPhase = 'idle' | 'generating'
type ExtractEmrDemographicsResponse = {
  ok?: boolean
  data?: {
    profileId?: string
    selectorMatched?: string
    demographicsText?: string
    sourceUrl?: string
    sourcePath?: string
    signalSummary?: {
      score: number
      matched: string[]
      missing: string[]
    }
    textPreview?: string
  }
  error?: unknown
}

type SyncChiefComplaintPayload = {
  chiefComplaintText: string
  presentIllnessText: string
  autoSave?: boolean
  debug?: boolean
  requestId?: string
}

const DEBUG_EMR_BRIDGE = true
const NOTES_PAGE_SIZE = 10

function patientDisplayName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim()
}

function logEmrDebug(scope: string, message: string, details?: unknown) {
  if (!DEBUG_EMR_BRIDGE) return
  const prefix = `[FastDoc][${scope}]`
  if (details === undefined) {
    console.log(`${prefix} ${message}`)
  } else {
    console.log(`${prefix} ${message}`, details)
  }
}

function errorStatusCode(error: unknown): number | null {
  if (error instanceof AuthApiError && typeof error.status === 'number') return error.status
  if (error instanceof EncounterApiError && typeof error.status === 'number') return error.status
  if (error instanceof ReportApiError && typeof error.status === 'number') return error.status
  if (error instanceof EmrApiError && typeof error.status === 'number') return error.status
  if (error instanceof PatientApiError && typeof error.status === 'number') return error.status
  return null
}

const NAV_TABS: NavTab[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" /> },
  { id: 'recording', label: 'Record', icon: <Mic className="h-5 w-5" /> },
  { id: 'notes', label: 'Notes', icon: <FileText className="h-5 w-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
]

export default function App() {
  const [isBootstrappingAuth, setIsBootstrappingAuth] = React.useState(true)
  const [isLoggedIn, setIsLoggedIn] = React.useState(false)
  const [isLoggingIn, setIsLoggingIn] = React.useState(false)
  const [loggedInUsername, setLoggedInUsername] = React.useState('')
  const [accessToken, setAccessToken] = React.useState<string | null>(null)
  const [providerId, setProviderId] = React.useState<string | null>(null)
  const [providerProfile, setProviderProfile] = React.useState<ProviderProfile | null>(null)
  const [currentPage, setCurrentPage] = React.useState<AppPage>('home')
  const [patient, setPatient] = React.useState<Patient | null>(null)
  const [patientSheetOpen, setPatientSheetOpen] = React.useState(false)
  const [patientSheetIntent, setPatientSheetIntent] = React.useState<'select' | 'match'>('select')
  const [isDark, setIsDark] = React.useState(false)
  const [soapFlowPhase, setSoapFlowPhase] = React.useState<SoapFlowPhase>('idle')
  const [patientDemoEncounterId, setPatientDemoEncounterId] = React.useState<string | null>(null)
  const [patientDemoReturnTab, setPatientDemoReturnTab] = React.useState<'home' | 'notes'>('home')
  const [activeEncounterId, setActiveEncounterId] = React.useState<string | null>(null)
  const [activeEncounterSummary, setActiveEncounterSummary] = React.useState<EncounterSummary | null>(
    null,
  )
  const [activeEncounterDetail, setActiveEncounterDetail] = React.useState<EncounterSummary | null>(null)
  const [activeEncounterReport, setActiveEncounterReport] = React.useState<EncounterReport | null>(null)
  const [homeEncounters, setHomeEncounters] = React.useState<EncounterSummary[]>([])
  const [notesEncounters, setNotesEncounters] = React.useState<EncounterSummary[]>([])
  const [notesPage, setNotesPage] = React.useState(1)
  const [notesHasMore, setNotesHasMore] = React.useState(false)
  const [transcriptReturnPage, setTranscriptReturnPage] = React.useState<AppPage>('soap')
  const [isEmrGenerating, setIsEmrGenerating] = React.useState(false)
  const emrPollIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const expireSessionAndRedirectToLogin = React.useCallback(async () => {
    try {
      await clearAuthSession()
    } catch {
      // no-op
    }
    try {
      await clearPersistedProviderProfile()
    } catch {
      // no-op
    }
    setSoapFlowPhase('idle')
    setPatientDemoEncounterId(null)
    setIsLoggedIn(false)
    setLoggedInUsername('')
    setAccessToken(null)
    setProviderId(null)
    setProviderProfile(null)
    setPatient(null)
    setActiveEncounterId(null)
    setActiveEncounterSummary(null)
    setActiveEncounterDetail(null)
    setActiveEncounterReport(null)
    setHomeEncounters([])
    setNotesEncounters([])
    setNotesPage(1)
    setNotesHasMore(false)
    setCurrentPage('home')
    toast.warning('Session expired. Please sign in again.')
  }, [])

  const withAuthRetry = React.useCallback(
    async <T,>(request: (token: string) => Promise<T>): Promise<T> => {
      const token = accessToken?.trim()
      if (!token) {
        await expireSessionAndRedirectToLogin()
        throw new Error('Session expired. Please sign in again.')
      }

      try {
        return await request(token)
      } catch (error) {
        if (errorStatusCode(error) !== 401) {
          throw error
        }
      }

      const persisted = await loadAuthSession()
      const refreshToken = persisted?.refreshToken?.trim()
      if (!refreshToken) {
        await expireSessionAndRedirectToLogin()
        throw new Error('Session expired. Please sign in again.')
      }

      try {
        const refreshed = await refreshProviderToken(refreshToken)
        const refreshedUser = await fetchCurrentUser(refreshed.accessToken)
        await saveAuthSession({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          username: refreshedUser.email,
          user: refreshedUser,
        })
        setAccessToken(refreshed.accessToken)
        setProviderId(refreshedUser.providerId)
        if (refreshedUser.providerId) {
          const cachedProfile = await loadPersistedProviderProfile(refreshedUser.providerId)
          setProviderProfile(cachedProfile)
        } else {
          setProviderProfile(null)
        }
        setLoggedInUsername(refreshedUser.email)
        setIsLoggedIn(true)
        return await request(refreshed.accessToken)
      } catch {
        await expireSessionAndRedirectToLogin()
        throw new Error('Session expired. Please sign in again.')
      }
    },
    [accessToken, expireSessionAndRedirectToLogin],
  )

  const refreshTodayEncounters = React.useCallback(
    async (showToastOnError = true) => {
      if (!accessToken || !isLoggedIn) {
        setHomeEncounters([])
        return [] as EncounterSummary[]
      }

      try {
        const encounters = await withAuthRetry((token) =>
          listEncounters(token, { todayOnly: true, page: 1, pageSize: 20 }),
        )
        setHomeEncounters(encounters)
        return encounters
      } catch (error) {
        if (showToastOnError) {
          const message =
            error instanceof Error ? error.message : 'Unable to load today encounters right now.'
          toast.warning(message)
        }
        return [] as EncounterSummary[]
      }
    },
    [isLoggedIn, withAuthRetry],
  )

  const loadNotesEncountersPage = React.useCallback(
    async (page: number, showToastOnError = true) => {
      if (!accessToken || !isLoggedIn) {
        setNotesEncounters([])
        setNotesHasMore(false)
        return
      }

      try {
        const encounters = await withAuthRetry((token) =>
          listEncounters(token, { page, pageSize: NOTES_PAGE_SIZE }),
        )
        setNotesEncounters(encounters)
        setNotesHasMore(encounters.length >= NOTES_PAGE_SIZE)
      } catch (error) {
        setNotesEncounters([])
        setNotesHasMore(false)
        if (showToastOnError) {
          const message = error instanceof Error ? error.message : 'Unable to load encounters for notes.'
          toast.warning(message)
        }
      }
    },
    [isLoggedIn, withAuthRetry],
  )

  const openEncounterInSoap = React.useCallback(
    async (encounterId: string, summary?: EncounterSummary) => {
      if (!isLoggedIn || !accessToken) {
        toast.warning('Please sign in to open encounter notes.')
        return
      }

      const id = encounterId.trim()
      if (!id) {
        toast.warning('Encounter is missing an ID.')
        return
      }

      setActiveEncounterId(id)
      if (summary) {
        setActiveEncounterSummary(summary)
      }
      if (summary && patient?.id !== summary.patientId) {
        setPatient(null)
      }

      try {
        const detail = await withAuthRetry((token) => getEncounter(token, id))
        setActiveEncounterDetail(detail)
        setActiveEncounterSummary(summary ?? detail)

        try {
          const report = await withAuthRetry((token) => getEncounterReport(token, id))
          setActiveEncounterReport(report)
          setCurrentPage('soap')
          setSoapFlowPhase('idle')
          return
        } catch (error) {
          if (error instanceof ReportApiError && error.status === 404) {
            setActiveEncounterReport(null)
            setCurrentPage('recording')
            setSoapFlowPhase('idle')
            toast.message('This encounter has no EMR note yet. Start a new recording.')
            return
          }
          throw error
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to open encounter report right now.'
        toast.warning(message)
        setSoapFlowPhase('idle')
      }
    },
    [
      accessToken,
      activeEncounterDetail,
      activeEncounterId,
      activeEncounterReport,
      activeEncounterSummary,
      isLoggedIn,
      patient?.id,
      withAuthRetry,
    ],
  )

  const handleGenerateEMR = React.useCallback(
    async (transcript: string, conversationDurationSeconds?: number) => {
      if (!isLoggedIn || !accessToken) {
        toast.warning('Please sign in before generating EMR.')
        return
      }
      if (!patient?.id) {
        toast.warning('Select a patient before generating EMR.')
        return
      }
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!UUID_RE.test(patient.id)) {
        toast.warning('Please use "Tap to match patient" to select a real patient before generating EMR.')
        return
      }
      const trimmedTranscript = transcript.trim()
      if (!trimmedTranscript) {
        toast.warning('Transcript is empty. Please record or paste consultation text first.')
        return
      }

      // Phase 1: find or create encounter — stay on recording page so errors are shown here
      let encounter: EncounterSummary | null = null
      try {
        if (activeEncounterDetail?.patientId === patient.id) {
          encounter = activeEncounterDetail
        } else if (activeEncounterSummary?.patientId === patient.id) {
          encounter = activeEncounterSummary
        }

        if (!encounter) {
          encounter = await withAuthRetry((token) =>
            createEncounter(token, {
              patientId: patient.id,
              providerId,
            }),
          )
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create encounter.'
        toast.warning(message)
        return
      }

      const encounterId = encounter.id
      setActiveEncounterId(encounterId)
      setActiveEncounterSummary(encounter)

      // Phase 2: submit generation job
      let submitted: EmrTaskSubmitted
      try {
        submitted = await withAuthRetry((token) =>
          generateEmr(token, {
            encounterId,
            patientId: patient.id,
            providerId,
            transcript: trimmedTranscript,
            conversationDurationSeconds,
          }),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to submit EMR generation. Please try again.'
        toast.warning(message)
        return
      }

      // Navigate to soap page immediately with loading state
      setIsEmrGenerating(true)
      setCurrentPage('soap')

      // Clear any existing poll interval
      if (emrPollIntervalRef.current) clearInterval(emrPollIntervalRef.current)

      // Capture values for the polling closure
      const pollEncounterId = encounterId
      const pollTaskId = submitted.taskId

      // Start polling every 10 seconds
      emrPollIntervalRef.current = setInterval(() => {
        void (async () => {
          try {
            const poll = await pollEmrTask(accessToken!, pollTaskId)
            if (poll.status === 'finished') {
              clearInterval(emrPollIntervalRef.current!)
              emrPollIntervalRef.current = null
              const [detail, report] = await Promise.all([
                withAuthRetry((token) => getEncounter(token, pollEncounterId)),
                withAuthRetry((token) => getEncounterReport(token, pollEncounterId)),
              ])
              setActiveEncounterDetail(detail)
              setActiveEncounterSummary(detail)
              setActiveEncounterReport(report)
              await refreshTodayEncounters(false)
              setIsEmrGenerating(false)
              toast.success('SOAP note ready')
            } else if (poll.status === 'failed') {
              clearInterval(emrPollIntervalRef.current!)
              emrPollIntervalRef.current = null
              setIsEmrGenerating(false)
              setCurrentPage('recording')
              toast.warning(poll.error)
            }
            // else pending/running — continue polling
          } catch (err) {
            clearInterval(emrPollIntervalRef.current!)
            emrPollIntervalRef.current = null
            setIsEmrGenerating(false)
            const message = err instanceof Error ? err.message : String(err)
            toast.warning(message)
          }
        })()
      }, 10_000)
    },
    [
      accessToken,
      activeEncounterDetail,
      activeEncounterSummary,
      isLoggedIn,
      patient,
      providerId,
      refreshTodayEncounters,
      withAuthRetry,
    ],
  )

  function handleNavChange(id: AppPage) {
    setSoapFlowPhase('idle')
    setPatientDemoEncounterId(null)
    setCurrentPage(id)
  }

  function openPatientDemographic(from: 'home' | 'notes', encounterId: string) {
    setPatientDemoReturnTab(from)
    setPatientDemoEncounterId(encounterId)
    setCurrentPage('patient-demographic')
  }

  function closePatientDemographic() {
    setPatientDemoEncounterId(null)
    setCurrentPage(patientDemoReturnTab)
  }

  function openProviderPage() {
    setCurrentPage('provider')
  }

  function closeProviderPage() {
    setCurrentPage('settings')
  }

  // Sync dark mode class on <html>
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  React.useEffect(() => {
    return () => {
      if (emrPollIntervalRef.current) {
        clearInterval(emrPollIntervalRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    async function bootstrapAuthSession() {
      try {
        const persistedSession = await loadAuthSession()
        if (!persistedSession) {
          return
        }

        let meError: unknown = null
        try {
          const user = await fetchCurrentUser(persistedSession.accessToken)
          if (cancelled) return
          setAccessToken(persistedSession.accessToken)
          setProviderId(user.providerId)
          if (user.providerId) {
            const cachedProfile = await loadPersistedProviderProfile(user.providerId)
            if (!cancelled) {
              setProviderProfile(cachedProfile)
            }
          } else if (!cancelled) {
            setProviderProfile(null)
          }
          setLoggedInUsername(user.email)
          setIsLoggedIn(true)
          await saveAuthSession({
            accessToken: persistedSession.accessToken,
            refreshToken: persistedSession.refreshToken,
            username: user.email,
            user,
          })
          return
        } catch (error) {
          meError = error
        }

        const shouldAttemptRefresh =
          meError instanceof AuthApiError && meError.status === 401

        if (!shouldAttemptRefresh) {
          return
        }

        try {
          const refreshed = await refreshProviderToken(persistedSession.refreshToken)
          await saveAuthSession({
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            username: persistedSession.username,
            user: persistedSession.user,
          })

          const refreshedUser = await fetchCurrentUser(refreshed.accessToken)
          if (cancelled) return
          await saveAuthSession({
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            username: refreshedUser.email,
            user: refreshedUser,
          })
          setAccessToken(refreshed.accessToken)
          setProviderId(refreshedUser.providerId)
          if (refreshedUser.providerId) {
            const cachedProfile = await loadPersistedProviderProfile(refreshedUser.providerId)
            if (!cancelled) {
              setProviderProfile(cachedProfile)
            }
          } else if (!cancelled) {
            setProviderProfile(null)
          }
          setLoggedInUsername(refreshedUser.email)
          setIsLoggedIn(true)
          return
        } catch {
          await clearAuthSession()
        }
      } catch {
        await clearAuthSession()
      } finally {
        if (!cancelled) {
          setIsBootstrappingAuth(false)
        }
      }
    }

    void bootstrapAuthSession()

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!isLoggedIn || !accessToken || !providerId) {
      return
    }
    const token = accessToken
    const pid = providerId
    let cancelled = false

    async function syncProviderProfile() {
      try {
        const profile = await fetchProviderProfile(token, pid, loggedInUsername)
        if (cancelled) return
        setProviderProfile(profile)
        await savePersistedProviderProfile(pid, profile)
      } catch {
        // Keep existing/cached profile on failure.
      }
    }

    void syncProviderProfile()

    return () => {
      cancelled = true
    }
  }, [isLoggedIn, accessToken, providerId, loggedInUsername])

  React.useEffect(() => {
    if (currentPage !== 'home') {
      return
    }
    void refreshTodayEncounters(false)
  }, [currentPage, refreshTodayEncounters])

  React.useEffect(() => {
    if (currentPage !== 'notes') {
      return
    }
    void loadNotesEncountersPage(notesPage, false)
  }, [currentPage, loadNotesEncountersPage, notesPage])

  async function handleLogin(username: string, password: string) {
    if (isLoggingIn) {
      return
    }
    setIsLoggingIn(true)
    try {
      const result = await loginWithPassword(username, password)
      const user = await fetchCurrentUser(result.accessToken)
      const normalizedUsername = user.email.trim() || username.trim() || 'Doctor'

      await saveAuthSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        username: normalizedUsername,
        user,
      })
      setProviderId(user.providerId)
      if (user.providerId) {
        const cachedProfile = await loadPersistedProviderProfile(user.providerId)
        setProviderProfile(cachedProfile)
      } else {
        setProviderProfile(null)
      }

      setAccessToken(result.accessToken)
      setLoggedInUsername(normalizedUsername)
      setIsLoggedIn(true)
      toast.success(`Welcome back, ${normalizedUsername}!`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to sign in right now.'
      toast.warning(errorMessage)
    } finally {
      setIsLoggingIn(false)
    }
  }

  async function handleLogout() {
    const tokenForLogout = accessToken
    if (tokenForLogout) {
      try {
        await logoutProvider(tokenForLogout)
      } catch {
        // Best effort: local logout should still complete.
      }
    }

    let storageClearFailed = false
    try {
      await clearAuthSession()
    } catch {
      storageClearFailed = true
    } finally {
      try {
        await clearPersistedProviderProfile()
      } catch {
        // Do not block logout on provider profile storage cleanup.
      }
      setSoapFlowPhase('idle')
      setPatientDemoEncounterId(null)
      setIsLoggedIn(false)
      setLoggedInUsername('')
      setAccessToken(null)
      setProviderId(null)
      setProviderProfile(null)
      setPatient(null)
      setActiveEncounterId(null)
      setActiveEncounterSummary(null)
      setActiveEncounterDetail(null)
      setActiveEncounterReport(null)
      setHomeEncounters([])
      setNotesEncounters([])
      setNotesPage(1)
      setNotesHasMore(false)
      setCurrentPage('home')
      toast.info('Signed out')
    }

    if (storageClearFailed) {
      toast.warning('Signed out locally, but failed to clear saved session.')
    }
  }

  function openPatientSheet(intent: 'select' | 'match') {
    setPatientSheetIntent(intent)
    setPatientSheetOpen(true)
  }

  function handleSelectPatient(p: Patient) {
    setPatient(p)
    const name = patientDisplayName(p)
    toast.success(
      patientSheetIntent === 'match' ? `Patient matched: ${name}` : `Patient selected: ${name}`,
    )
  }

  function handleDismissActiveRecordingPatient() {
    if (patient != null) {
      setPatient(null)
    }
  }

  const handleTapMatchPatient = React.useCallback(async () => {
    if (!accessToken) {
      toast.warning('Please sign in before matching a patient from EMR.')
      return
    }

    const requestId = `demographics-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    try {
      logEmrDebug('sidepanel', 'start demographics extraction', { requestId })
      const result = (await browser.runtime.sendMessage({
        type: 'FD_EXTRACT_EMR_DEMOGRAPHICS',
        payload: { debug: DEBUG_EMR_BRIDGE, requestId },
      })) as ExtractEmrDemographicsResponse

      logEmrDebug('sidepanel', 'received demographics response', { requestId, result })
      if (result == null) {
        logEmrDebug('sidepanel', 'no response: likely stale background/content script, reload extension + refresh target tab', {
          requestId,
        })
        toast.warning('Could not extract demographics from the active page')
        return
      }

      if (result?.ok) {
        const demographics = result.data ?? {}
        logEmrDebug('sidepanel', 'demographics html payload', {
          requestId,
          profileId: demographics.profileId,
          selectorMatched: demographics.selectorMatched,
          sourceUrl: demographics.sourceUrl,
          sourcePath: demographics.sourcePath,
          signalSummary: demographics.signalSummary,
          textPreview: demographics.textPreview,
          demographicsText: demographics.demographicsText,
        })
        console.log('[FastDoc] Demographics section text:', demographics.demographicsText ?? '')

        const text = demographics.demographicsText ?? ''
        if (!text.trim()) {
          toast.warning('Demographics text is empty in this EMR section')
          return
        }
        const clinicId = providerProfile?.clinicId?.trim()
        const divisionId = providerProfile?.divisionId?.trim()
        const clinicSystem = providerProfile?.clinicSystem?.trim()
        if (!clinicId || !divisionId || !clinicSystem) {
          toast.warning('Provider profile is missing clinic context (clinic/division/system).')
          return
        }
        const parsedResult = await withAuthRetry((token) =>
          parseDemographicsTextWithLlm(token, text, {
            clinicId,
            divisionId,
            clinicSystem,
            clinicName: providerProfile?.clinicName ?? null,
          }),
        )
        setPatient(parsedResult.patient)
        const name = patientDisplayName(parsedResult.patient)
        if (parsedResult.isNew) {
          toast.success(`Created new patient: ${name}`)
        } else {
          toast.success(`Matched existing patient: ${name}`)
        }
      } else {
        const errorMessage =
          typeof result?.error === 'string' ? result.error : 'Patient demographics section not found'
        toast.warning(errorMessage)
      }
    } catch (error) {
      logEmrDebug('sidepanel', 'demographics extraction threw error', { requestId, error })
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract demographics'
      toast.warning(errorMessage)
    }
  }, [accessToken, providerProfile, withAuthRetry])

  const handleSyncSoapToEmr = React.useCallback(async (payload: SyncChiefComplaintPayload) => {
    const requestId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    try {
      logEmrDebug('sidepanel', 'start sync chief complaint', {
        requestId,
        chiefLength: (payload.chiefComplaintText ?? '').length,
        hpiLength: (payload.presentIllnessText ?? '').length,
        autoSave: payload.autoSave ?? false,
      })

      const result = (await browser.runtime.sendMessage({
        type: 'FD_SYNC_EMR_CHIEF_COMPLAINT',
        payload: {
          ...payload,
          autoSave: payload.autoSave === true,
          debug: DEBUG_EMR_BRIDGE,
          requestId,
        },
      })) as { ok?: boolean; error?: unknown } | null

      logEmrDebug('sidepanel', 'received sync response', { requestId, result })

      if (result?.ok) {
        toast.success('Synced SOAP summary to EMR chief complaint')
        return
      }

      const errorMessage =
        typeof result?.error === 'string'
          ? result.error
          : 'Could not sync to EMR from this page'
      toast.warning(errorMessage)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync EMR chief complaint'
      toast.warning(errorMessage)
    }
  }, [])

  const PAGE_TITLES: Record<AppPage, string> = {
    home: 'FastDoc',
    notes: 'Notes',
    recording: 'Recording',
    soap: 'AI EMR',
    transcript: 'Transcript',
    settings: 'Settings',
    'patient-demographic': 'Patient demographics',
    provider: 'Provider',
  }

  const patientDemographicPayload =
    patientDemoEncounterId != null ? getDemographicByEncounterId(patientDemoEncounterId) : null
  const soapPageKey = `${activeEncounterId ?? 'none'}:${activeEncounterReport?.generatedAt ?? 'none'}`
  const soapPatient =
    patient && activeEncounterSummary && patient.id !== activeEncounterSummary.patientId ? null : patient

  if (isBootstrappingAuth) {
    return (
      <AppShell>
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Restoring session...
        </div>
      </AppShell>
    )
  }

  if (!isLoggedIn) {
    return (
      <AppShell>
        <LoginForm onLogin={handleLogin} isLoading={isLoggingIn} />
      </AppShell>
    )
  }

  return (
    <AppShell>
      {currentPage !== 'home' && (
        <TopBar
          title={
            currentPage === 'soap' && soapFlowPhase === 'generating'
              ? 'Generating…'
              : PAGE_TITLES[currentPage]
          }
          onBack={
            currentPage === 'patient-demographic'
              ? closePatientDemographic
              : currentPage === 'transcript'
                ? () => setCurrentPage(transcriptReturnPage)
              : currentPage === 'provider'
                ? closeProviderPage
                : undefined
          }
        />
      )}

      <div className="flex-1 overflow-hidden">
        {currentPage === 'home' && (
          <HomePage
            patient={patient}
            username={loggedInUsername}
            doctorDisplayName={providerProfile ? providerDisplayName(providerProfile) : undefined}
            providerSpecialty={providerProfile?.specialty}
            clinicSiteLabel={providerProfile?.siteLabel}
            onChangePatient={() => openPatientSheet('select')}
            onClearSelectedPatient={() => setPatient(null)}
            onOpenMatchPatientPicker={() => openPatientSheet('match')}
            onNavigate={(page) => handleNavChange(page)}
            encounters={homeEncounters}
            onOpenEncounter={(encounterId) => void openEncounterInSoap(encounterId)}
          />
        )}
        {currentPage === 'notes' && (
          <NotesPage
            patientId={patient?.id}
            encounters={notesEncounters}
            page={notesPage}
            hasMore={notesHasMore}
            onPrevPage={() => setNotesPage((prev) => Math.max(1, prev - 1))}
            onNextPage={() => setNotesPage((prev) => prev + 1)}
            onOpenEncounter={(encounterId) => void openEncounterInSoap(encounterId)}
          />
        )}
        {currentPage === 'recording' && (
          <RecordingPage
            patient={patient}
            onGenerateEMR={handleGenerateEMR}
            onOpenPatientPicker={() => openPatientSheet('select')}
            onTapMatchPatient={handleTapMatchPatient}
            onDismissActivePatient={handleDismissActiveRecordingPatient}
          />
        )}
        {currentPage === 'soap' && soapFlowPhase === 'generating' && <SoapGeneratingPage />}
        {currentPage === 'soap' && soapFlowPhase === 'idle' && (
          <SoapPage
            key={soapPageKey}
            patient={soapPatient}
            encounterReport={activeEncounterReport}
            encounterSummary={activeEncounterSummary}
            isGenerating={isEmrGenerating}
            onOpenPatientPicker={() => openPatientSheet('select')}
            onOpenTranscript={() => {
              setTranscriptReturnPage('soap')
              setCurrentPage('transcript')
            }}
            onSyncToEmr={handleSyncSoapToEmr}
          />
        )}
        {currentPage === 'transcript' && (
          <TranscriptPage
            patient={soapPatient}
            encounter={activeEncounterDetail ?? activeEncounterSummary}
          />
        )}
        {currentPage === 'settings' && (
          <SettingsPage
            isDark={isDark}
            onToggleDark={setIsDark}
            onLogout={handleLogout}
            username={providerProfile ? providerDisplayName(providerProfile) : loggedInUsername || undefined}
            providerSpecialty={providerProfile?.specialty}
            clinicName={providerProfile?.clinicName}
            onOpenProvider={openProviderPage}
          />
        )}
        {currentPage === 'provider' && (
          <ProviderPage provider={providerProfile ?? getProviderProfile(loggedInUsername)} />
        )}
        {currentPage === 'patient-demographic' && patientDemographicPayload && (
          <PatientDemographicPage demographic={patientDemographicPayload} />
        )}
      </div>

      <BottomNav
        tabs={NAV_TABS}
        value={
          currentPage === 'patient-demographic'
            ? patientDemoReturnTab
            : currentPage === 'provider'
              ? 'settings'
              : currentPage
        }
        onChange={(id) => handleNavChange(id as AppPage)}
      />

      <PatientSearchSheet
        open={patientSheetOpen}
        onOpenChange={(open) => {
          setPatientSheetOpen(open)
          if (!open) setPatientSheetIntent('select')
        }}
        onSelect={handleSelectPatient}
        accessToken={accessToken}
      />
    </AppShell>
  )
}
