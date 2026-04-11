import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Stethoscope, Mail, Lock, Eye, EyeOff } from 'lucide-react'

interface LoginFormProps {
  onLogin: (username: string, password: string) => void
  isLoading?: boolean
}

const labelClass =
  'ml-1 text-xs font-bold uppercase tracking-widest text-muted-foreground'

const inputShellClass =
  'h-auto border-0 bg-muted py-4 pl-12 pr-4 text-base shadow-none transition-all placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring'

export function LoginForm({ onLogin, isLoading = false }: LoginFormProps) {
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onLogin(username, password)
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
            <Stethoscope className="size-10 text-primary-foreground" aria-hidden />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              FastDoc
            </h1>
            <p className="text-sm font-medium tracking-wide text-muted-foreground">
              Medical documentation assistant
            </p>
          </div>
        </header>

        <section className="rounded-lg border border-border/50 bg-card p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="space-y-2">
              <label className={labelClass} htmlFor="username">
                Username
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Mail className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
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
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center rounded-full bg-primary py-4 text-lg font-extrabold text-primary-foreground shadow-md shadow-primary/30 transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
