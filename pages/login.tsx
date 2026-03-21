import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/router'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      })

      if (!response.ok) {
        setError('Invalid credentials')
        return
      }

      await router.push('/')
    } catch {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--apple-bg)] font-sans antialiased text-[var(--apple-text)] px-5">
      <div className="w-full max-w-[420px] px-8 py-12 flex flex-col items-center metric-card">
        <div className="mb-10 text-center">
          <p className="text-[12px] text-[var(--apple-text-muted)] font-medium uppercase tracking-widest">Career Pipeline</p>
        </div>

        <form onSubmit={handleLogin} className="w-full flex flex-col gap-5">
          <div>
            <label className="block text-[11px] font-bold text-[var(--apple-text-muted)] uppercase tracking-[0.15em] mb-2 px-1">
              Username
            </label>
            <input
              type="text"
              className="apple-input w-full p-4 text-[14px] font-medium"
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--apple-text-muted)] uppercase tracking-[0.15em] mb-2 px-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="apple-input w-full p-4 pr-20 text-[14px] font-medium"
                placeholder="********"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--apple-text-muted)]"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-[var(--apple-error)] text-[12px] font-bold text-center bg-[rgba(255,69,58,0.1)] py-2 rounded-lg">
              Authentication failed
            </div>
          )}

          <button type="submit" disabled={loading} className="apple-btn-primary w-full py-4 mt-2 text-[14px] font-bold uppercase tracking-widest shadow-lg disabled:opacity-60">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

      </div>
    </div>
  )
}
