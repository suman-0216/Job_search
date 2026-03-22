import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/router'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim(),
          fullName: username.trim(),
          password,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setError(payload.error || (mode === 'login' ? 'Invalid credentials' : 'Registration failed'))
        return
      }

      const payload = (await response.json()) as { message?: string }
      if (mode === 'register') {
        setNotice(payload.message || 'Account created. Verify your email from inbox and then sign in.')
        setMode('login')
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
    <div className="login-shell">
      <div className="login-card">
        <div className="login-head">
          <p className="login-kicker">Career Pipeline</p>
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={`login-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'register' && (
            <div>
              <label className="login-label">
                Email
              </label>
              <input
                type="email"
                className="apple-input login-input"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          )}
          <div>
            <label className="login-label">
              {mode === 'login' ? 'Username or Email' : 'Username'}
            </label>
            <input
              type="text"
              className="apple-input login-input"
              placeholder={mode === 'login' ? 'Username or email' : 'Username'}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="login-label">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="apple-input login-input pr-24"
                placeholder="********"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="login-show-btn"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {notice && (
            <div className="rounded-[10px] bg-[rgba(52,199,89,0.12)] px-3 py-2 text-center text-xs font-semibold text-[var(--apple-success)]">
              {notice}
            </div>
          )}

          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="apple-btn-primary login-submit disabled:opacity-60">
            {loading ? (mode === 'login' ? 'Signing in...' : 'Creating...') : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>
      </div>
    </div>
  )
}
