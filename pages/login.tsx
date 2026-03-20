import { useState } from 'react'
import { useRouter } from 'next/router'
import { GetServerSideProps } from 'next'

interface LoginProps {
  envUser: string
  envPass: string
}

export default function Login({ envUser, envPass }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    
    const targetUser = envUser || 'Suman'
    const targetPass = envPass || 'Suman@16'

    if (username === targetUser && password === targetPass) {
      localStorage.setItem('auth', 'true')
      router.push('/')
    } else {
      setError('Invalid credentials')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--apple-bg)] font-sans antialiased text-[var(--apple-text)]">
      <div className="w-full max-w-[400px] px-8 py-12 flex flex-col items-center">
        
        <div className="mb-12 text-center">
          <div className="w-16 h-16 bg-[var(--apple-accent)] text-white rounded-2xl flex items-center justify-center text-3xl shadow-xl mx-auto mb-6 transform hover:rotate-12 transition-transform">
            🚀
          </div>
          <h1 className="text-3xl font-black tracking-tighter mb-2">Job Hunter <span className="text-[var(--apple-accent)]">Pro</span></h1>
          <p className="text-[13px] text-[var(--apple-text-muted)] font-medium uppercase tracking-widest">Secure Career Pipeline</p>
        </div>

        <form onSubmit={handleLogin} className="w-full flex flex-col gap-5">
          <div>
            <label className="block text-[11px] font-bold text-[var(--apple-text-muted)] uppercase tracking-[0.15em] mb-2 px-1">Identity</label>
            <input 
              type="text" 
              className="apple-input w-full p-4 text-[14px] font-medium" 
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--apple-text-muted)] uppercase tracking-[0.15em] mb-2 px-1">Passkey</label>
            <input 
              type="password" 
              className="apple-input w-full p-4 text-[14px] font-medium"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="text-[var(--apple-error)] text-[12px] font-bold text-center bg-[rgba(255,69,58,0.1)] py-2 rounded-lg">
              Authentication Failed
            </div>
          )}
          <button 
            type="submit" 
            className="apple-btn-primary w-full py-4 mt-4 text-[14px] font-bold uppercase tracking-widest shadow-lg"
          >
            Authorize Access
          </button>
        </form>

        <p className="mt-12 text-[11px] text-[var(--apple-text-muted)] font-medium text-center leading-relaxed">
          Proprietary Dashboard for Executive Career Infiltration. <br/>
          Unauthorized access is logged.
        </p>
      </div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    props: {
      envUser: process.env.USERNAME || 'Suman',
      envPass: process.env.PASSWORD || 'Suman@16',
    },
  }
}
