import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Zap, Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'

interface LoginFormProps {
  onLogin: (username: string, password: string) => void
  isLoading?: boolean
}

const labelClass =
  'ml-1 text-xs font-bold uppercase tracking-widest text-muted-foreground'

const inputShellClass =
  'h-auto border-0 bg-muted py-4 pl-12 pr-4 text-base shadow-none transition-all placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring'

// Testing stage default OTP for the security-code step.
const DEMO_SECURITY_CODE = '123456'

function maskEmailForDisplay(raw: string): string {
  const t = raw.trim()
  if (!t.includes('@')) return t || 'your email'
  const [local, domain] = t.split('@')
  if (!local || !domain) return t
  if (local.length <= 1) return `*@${domain}`
  return `${local[0]}•••${local.slice(-1)}@${domain}`
}

export function LoginForm({ onLogin, isLoading = false }: LoginFormProps) {
  const [step, setStep] = React.useState<'credentials' | 'email2fa'>('credentials')
  const [username, setUsername] = React.useState('schen@emr.local')
  const [password, setPassword] = React.useState('Doctor@2026!')
  const [showPassword, setShowPassword] = React.useState(false)
  const [otp, setOtp] = React.useState(DEMO_SECURITY_CODE)
  const [otpError, setOtpError] = React.useState('')
  const [sendingCode, setSendingCode] = React.useState(false)

  function resetToCredentials() {
    setStep('credentials')
    setOtp(DEMO_SECURITY_CODE)
    setOtpError('')
    setSendingCode(false)
  }

  function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault()
    setOtpError('')
    setSendingCode(true)
    window.setTimeout(() => {
      setSendingCode(false)
      setStep('email2fa')
      setOtp(DEMO_SECURITY_CODE)
      toast.message('Security code sent (demo)', {
        description: `Default code is ${DEMO_SECURITY_CODE}. We would email ${maskEmailForDisplay(username)}.`,
      })
    }, 700)
  }

  function handle2faSubmit(e: React.FormEvent) {
    e.preventDefault()
    const digits = otp.replace(/\D/g, '')
    if (digits.length !== 6) {
      setOtpError('Enter the 6-digit code from your email.')
      return
    }
    setOtpError('')
    onLogin(username, password)
  }

  function handleResendCode() {
    toast.info('Demo: a new code would be sent to your email.')
  }

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col items-center justify-center overflow-hidden bg-background p-4">
      <div
        className="pointer-events-none fixed -top-24 -right-24 size-64 rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -bottom-24 -left-24 size-64 rounded-full bg-muted blur-3xl"
        aria-hidden
      />

      <main className="relative z-10 flex w-full max-w-[400px] flex-col gap-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-20 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/25">
            <Zap className="size-10 text-primary-foreground" aria-hidden />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">FastDoc</h1>
            <p className="text-sm font-medium tracking-wide text-muted-foreground italic">
              Your AI Scribe for modern clinical practice.
            </p>
          </div>
        </header>

        <section className="rounded-lg border border-border/50 bg-card p-8 shadow-sm">
          <AnimatePresence mode="wait" initial={false}>
            {step === 'credentials' ? (
              <motion.div
                key="credentials"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-6">
                  <div className="space-y-2">
                    <label className={labelClass} htmlFor="username">
                      Email
                    </label>
                    <div className="group relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <Mail className="size-5 text-muted-foreground" aria-hidden />
                      </div>
                      <Input
                        id="username"
                        type="email"
                        placeholder="you@clinic.org"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        autoComplete="username"
                        className={cn('rounded-sm', inputShellClass)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass} htmlFor="password">
                      Password
                    </label>
                    <div className="group relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <Lock className="size-5 text-muted-foreground" aria-hidden />
                      </div>
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        className={cn('rounded-sm pr-12', inputShellClass)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center pr-4 text-muted-foreground transition-colors hover:text-primary"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="size-5" aria-hidden />
                        ) : (
                          <Eye className="size-5" aria-hidden />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || sendingCode}
                    className="inline-flex w-full items-center justify-center rounded-full bg-primary py-4 text-lg font-extrabold text-primary-foreground shadow-md shadow-primary/30 transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {sendingCode ? 'Sending code…' : isLoading ? 'Signing in…' : 'Continue'}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="email2fa"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-6 flex flex-col items-center gap-2 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <ShieldCheck className="size-6" aria-hidden />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">Email verification</h2>
                  <p className="text-sm text-muted-foreground">
                    Enter the 6-digit code sent to{' '}
                    <span className="font-medium text-foreground">{maskEmailForDisplay(username)}</span>
                  </p>
                </div>

                <form onSubmit={handle2faSubmit} className="flex flex-col gap-5">
                  <div className="space-y-2">
                    <label className={labelClass} htmlFor="login-otp">
                      Security code
                    </label>
                    <Input
                      id="login-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                        setOtp(v)
                        setOtpError('')
                      }}
                      className={cn(
                        'rounded-sm border-0 bg-muted py-4 text-center text-2xl font-mono font-semibold tracking-[0.35em] shadow-none focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                      aria-invalid={Boolean(otpError)}
                      aria-describedby={otpError ? 'login-otp-error' : undefined}
                    />
                    {otpError ? (
                      <p id="login-otp-error" className="text-xs font-medium text-destructive" role="alert">
                        {otpError}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || otp.replace(/\D/g, '').length !== 6}
                    className="inline-flex w-full items-center justify-center rounded-full bg-primary py-4 text-lg font-extrabold text-primary-foreground shadow-md shadow-primary/30 transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {isLoading ? 'Signing in…' : 'Verify & sign in'}
                  </button>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={resetToCredentials}
                      className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ArrowLeft className="size-4" aria-hidden />
                      Back to sign in
                    </button>
                    <button
                      type="button"
                      onClick={handleResendCode}
                      className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      Resend code
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  )
}
