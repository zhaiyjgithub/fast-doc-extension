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
import { EMRPage } from '@/pages/emr-page'
import { SettingsPage } from '@/pages/settings-page'
import { Button } from '@/components/ui/button'
import { Home, FileText, Mic, ClipboardList, Settings, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

type AppPage = 'home' | 'notes' | 'recording' | 'emr' | 'settings'

const NAV_TABS: NavTab[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" /> },
  { id: 'notes', label: 'Notes', icon: <FileText className="h-5 w-5" /> },
  { id: 'recording', label: 'Record', icon: <Mic className="h-5 w-5" /> },
  { id: 'emr', label: 'EMR', icon: <ClipboardList className="h-5 w-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
]

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false)
  const [isLoggingIn, setIsLoggingIn] = React.useState(false)
  const [loggedInUsername, setLoggedInUsername] = React.useState('')
  const [currentPage, setCurrentPage] = React.useState<AppPage>('home')
  const [patient, setPatient] = React.useState<Patient | null>(null)
  const [patientSheetOpen, setPatientSheetOpen] = React.useState(false)
  const [isDark, setIsDark] = React.useState(false)

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
    setIsLoggedIn(false)
    setLoggedInUsername('')
    setPatient(null)
    setCurrentPage('home')
    toast.info('Signed out')
  }

  function handleSelectPatient(p: Patient) {
    setPatient(p)
    toast.success(`Patient selected: ${p.name}`)
  }

  const PAGE_TITLES: Record<AppPage, string> = {
    home: 'FastDoc',
    notes: 'Notes',
    recording: 'Recording',
    emr: 'EMR',
    settings: 'Settings',
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
          title={PAGE_TITLES[currentPage]}
          action={
            currentPage !== 'settings' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPatientSheetOpen(true)}
                aria-label="Select patient"
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            )
          }
        />
      )}

      <div className="flex-1 overflow-hidden">
        {currentPage === 'home' && (
          <HomePage
            patient={patient}
            username={loggedInUsername}
            onChangePatient={() => setPatientSheetOpen(true)}
            onNavigate={(page) => setCurrentPage(page)}
          />
        )}
        {currentPage === 'notes' && <NotesPage patientId={patient?.id} />}
        {currentPage === 'recording' && <RecordingPage patientId={patient?.id} />}
        {currentPage === 'emr' && <EMRPage patientId={patient?.id} />}
        {currentPage === 'settings' && (
          <SettingsPage
            isDark={isDark}
            onToggleDark={setIsDark}
            onLogout={handleLogout}
            username={loggedInUsername || undefined}
          />
        )}
      </div>

      <BottomNav
        tabs={NAV_TABS}
        value={currentPage}
        onChange={(id) => setCurrentPage(id as AppPage)}
      />

      <PatientSearchSheet
        open={patientSheetOpen}
        onOpenChange={setPatientSheetOpen}
        onSelect={handleSelectPatient}
      />
    </AppShell>
  )
}
