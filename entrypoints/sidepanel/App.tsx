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
            onDismissActivePatient={handleDismissActiveRecordingPatient}
          />
        )}
        {currentPage === 'soap' && soapFlowPhase === 'generating' && <SoapGeneratingPage />}
        {currentPage === 'soap' && soapFlowPhase === 'success' && <SoapSuccessPage />}
        {currentPage === 'soap' && soapFlowPhase === 'idle' && (
          <SoapPage patient={patient} onOpenPatientPicker={() => openPatientSheet('select')} />
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
