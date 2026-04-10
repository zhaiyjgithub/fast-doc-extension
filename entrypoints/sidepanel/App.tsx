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
  { id: 'home', label: '首页', icon: <Home className="h-5 w-5" /> },
  { id: 'notes', label: '笔记', icon: <FileText className="h-5 w-5" /> },
  { id: 'recording', label: '录音', icon: <Mic className="h-5 w-5" /> },
  { id: 'emr', label: 'EMR', icon: <ClipboardList className="h-5 w-5" /> },
  { id: 'settings', label: '设置', icon: <Settings className="h-5 w-5" /> },
]

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false)
  const [isLoggingIn, setIsLoggingIn] = React.useState(false)
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
      setIsLoggedIn(true)
      setIsLoggingIn(false)
      toast.success(`欢迎回来，${username}！`)
    }, 800)
  }

  function handleLogout() {
    setIsLoggedIn(false)
    setPatient(null)
    setCurrentPage('home')
    toast.info('已退出登录')
  }

  function handleSelectPatient(p: Patient) {
    setPatient(p)
    toast.success(`已选择患者：${p.name}`)
  }

  const PAGE_TITLES: Record<AppPage, string> = {
    home: 'FastDoc',
    notes: '笔记',
    recording: '录音',
    emr: 'EMR 病历',
    settings: '设置',
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
      <TopBar
        title={PAGE_TITLES[currentPage]}
        action={
          currentPage !== 'settings' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPatientSheetOpen(true)}
              aria-label="选择患者"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-hidden">
        {currentPage === 'home' && (
          <HomePage
            patient={patient}
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
