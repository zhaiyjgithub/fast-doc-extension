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
import { SoapSuccessPage } from '@/pages/soap-success-page'
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
  clearPersistedProviderProfile,
  loadPersistedProviderProfile,
  savePersistedProviderProfile,
} from '@/lib/provider-session'
import { getProviderProfile, providerDisplayName, type ProviderProfile } from '@/lib/mock-provider'
import { getDemographicByEncounterId } from '@/lib/patient-demographic'
import { parsePatientFromDemographicsText } from '@/lib/parse-emr-demographics-patient'
import { parseDemographicsTextWithLlm } from '@/lib/patient-api'
import { Home, FileText, Mic, Settings } from 'lucide-react'
import { toast } from 'sonner'

type AppPage =
  | 'home'
  | 'notes'
  | 'recording'
  | 'soap'
  | 'settings'
  | 'patient-demographic'
  | 'provider'
type SoapFlowPhase = 'idle' | 'generating' | 'success'
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
  const soapGenTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const soapSuccessTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [patientDemoEncounterId, setPatientDemoEncounterId] = React.useState<string | null>(null)
  const [patientDemoReturnTab, setPatientDemoReturnTab] = React.useState<'home' | 'notes'>('home')

  function clearSoapFlowTimers() {
    if (soapGenTimerRef.current) {
      clearTimeout(soapGenTimerRef.current)
      soapGenTimerRef.current = null
    }
    if (soapSuccessTimerRef.current) {
      clearTimeout(soapSuccessTimerRef.current)
      soapSuccessTimerRef.current = null
    }
  }

  function handleGenerateEMR(_transcript: string) {
    setCurrentPage('soap')
    setSoapFlowPhase('generating')
    clearSoapFlowTimers()
    soapGenTimerRef.current = setTimeout(() => {
      setSoapFlowPhase('success')
      soapGenTimerRef.current = null
      soapSuccessTimerRef.current = setTimeout(() => {
        setSoapFlowPhase('idle')
        soapSuccessTimerRef.current = null
        toast.success('SOAP note ready')
      }, 1500)
    }, 3500)
  }

  function handleNavChange(id: AppPage) {
    clearSoapFlowTimers()
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

  React.useEffect(() => () => clearSoapFlowTimers(), [])

  // Sync dark mode class on <html>
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

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
      clearSoapFlowTimers()
      setSoapFlowPhase('idle')
      setPatientDemoEncounterId(null)
      setIsLoggedIn(false)
      setLoggedInUsername('')
      setAccessToken(null)
      setProviderId(null)
      setProviderProfile(null)
      setPatient(null)
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
        const parsedPayload = await parseDemographicsTextWithLlm(accessToken, text)
        const parsed: Patient | null = parsedPayload.dateOfBirth
          ? {
              id: parsedPayload.clinicPatientId
                ? `emr-${parsedPayload.clinicPatientId}`
                : `emr-${Date.now()}`,
              firstName: parsedPayload.firstName,
              lastName: parsedPayload.lastName,
              dateOfBirth: parsedPayload.dateOfBirth,
              gender: parsedPayload.gender ?? undefined,
              primaryLanguage: parsedPayload.primaryLanguage,
              clinicPatientId: parsedPayload.clinicPatientId,
              clinicId: providerProfile?.clinicId ?? null,
              divisionId: providerProfile?.divisionId ?? null,
              clinicSystem: providerProfile?.clinicSystem ?? providerProfile?.siteLabel ?? null,
              clinicName: providerProfile?.clinicName ?? null,
              isActive: true,
              demographics:
                parsedPayload.demographics == null
                  ? null
                  : {
                      phone: parsedPayload.demographics.phone ?? null,
                      email: parsedPayload.demographics.email ?? null,
                      addressLine1: parsedPayload.demographics.addressLine1 ?? null,
                      city: parsedPayload.demographics.city ?? null,
                      state: parsedPayload.demographics.state ?? null,
                      zipCode: parsedPayload.demographics.zipCode ?? null,
                      country: null,
                    },
            }
          : parsePatientFromDemographicsText(text)
        if (parsed != null) {
          const alignedPatient: Patient = {
            ...parsed,
            clinicId: parsed.clinicId ?? providerProfile?.clinicId ?? null,
            divisionId: parsed.divisionId ?? providerProfile?.divisionId ?? null,
            clinicSystem:
              parsed.clinicSystem ?? providerProfile?.clinicSystem ?? providerProfile?.siteLabel ?? null,
            clinicName: parsed.clinicName ?? providerProfile?.clinicName ?? null,
          }
          setPatient(alignedPatient)
          toast.success(`Patient selected: ${patientDisplayName(alignedPatient)}`)
        } else {
          toast.warning('Demographics captured but patient fields could not be parsed (need DOB in MM/DD/YYYY)')
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
  }, [accessToken, providerProfile])

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
    settings: 'Settings',
    'patient-demographic': 'Patient demographics',
    provider: 'Provider',
  }

  const patientDemographicPayload =
    patientDemoEncounterId != null ? getDemographicByEncounterId(patientDemoEncounterId) : null

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
            onOpenEncounterPatient={(id) => openPatientDemographic('home', id)}
          />
        )}
        {currentPage === 'notes' && (
          <NotesPage
            patientId={patient?.id}
            onOpenEncounter={() => handleNavChange('soap')}
            onOpenEncounterPatient={(id) => openPatientDemographic('notes', id)}
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
        {currentPage === 'soap' && soapFlowPhase === 'success' && <SoapSuccessPage />}
        {currentPage === 'soap' && soapFlowPhase === 'idle' && (
          <SoapPage
            patient={patient}
            onOpenPatientPicker={() => openPatientSheet('select')}
            onSyncToEmr={handleSyncSoapToEmr}
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
      />
    </AppShell>
  )
}
