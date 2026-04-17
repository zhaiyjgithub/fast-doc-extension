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
import { getProviderProfile } from '@/lib/mock-provider'
import { getDemographicByEncounterId } from '@/lib/patient-demographic'
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
  const [isLoggedIn, setIsLoggedIn] = React.useState(false)
  const [isLoggingIn, setIsLoggingIn] = React.useState(false)
  const [loggedInUsername, setLoggedInUsername] = React.useState('')
  const [currentPage, setCurrentPage] = React.useState<AppPage>('home')
  const [patient, setPatient] = React.useState<Patient | null>(null)
  const [matchedPatient, setMatchedPatient] = React.useState<Patient | null>(null)
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

  function handleLogin(username: string, _password: string) {
    setIsLoggingIn(true)
    setTimeout(() => {
      setLoggedInUsername(username.trim() || 'Doctor')
      setIsLoggedIn(true)
      setIsLoggingIn(false)
      toast.success(`Welcome back, ${username}!`)
    }, 800)
  }

  function handleLogout() {
    clearSoapFlowTimers()
    setSoapFlowPhase('idle')
    setPatientDemoEncounterId(null)
    setIsLoggedIn(false)
    setLoggedInUsername('')
    setPatient(null)
    setMatchedPatient(null)
    setCurrentPage('home')
    toast.info('Signed out')
  }

  function openPatientSheet(intent: 'select' | 'match') {
    setPatientSheetIntent(intent)
    setPatientSheetOpen(true)
  }

  function handleSelectPatient(p: Patient) {
    if (patientSheetIntent === 'match') {
      setMatchedPatient(p)
      toast.success(`Patient matched: ${p.name}`)
    } else {
      setPatient(p)
      setMatchedPatient(null)
      toast.success(`Patient selected: ${p.name}`)
    }
  }

  function handleDismissActiveRecordingPatient() {
    if (patient != null) {
      setPatient(null)
    } else if (matchedPatient != null) {
      setMatchedPatient(null)
    }
  }

  const handleTapMatchPatient = React.useCallback(async () => {
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
        toast.success('Demographics section text captured and printed in console')
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
  }, [])

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
            matchedPatient={matchedPatient}
            onGenerateEMR={handleGenerateEMR}
            onOpenPatientPicker={() => openPatientSheet('select')}
            onOpenMatchPatientPicker={() => openPatientSheet('match')}
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
            username={loggedInUsername || undefined}
            onOpenProvider={openProviderPage}
          />
        )}
        {currentPage === 'provider' && (
          <ProviderPage provider={getProviderProfile(loggedInUsername)} />
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
