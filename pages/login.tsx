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
    
    // Check against props passed from server-side (Vercel Env Vars)
    // Fallback to defaults if env vars are missing
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
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-[#1d1d1f] p-8 rounded-[18px] border border-[#333336] w-full max-w-sm shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Job Hunter <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#2997ff] to-[#ab61ff]">Pro</span></h1>
          <p className="text-[#86868b] text-sm">Sign in to your private pipeline</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wide mb-1">Username</label>
            <input 
              type="text" 
              className="w-full p-3 bg-[#1d1d1f] border border-[#333336] rounded-lg text-white" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wide mb-1">Password</label>
            <input 
              type="password" 
              className="w-full p-3 bg-[#1d1d1f] border border-[#333336] rounded-lg text-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-[#ff3b30] text-sm text-center">{error}</p>}
          <button 
            type="submit" 
            className="mt-4 bg-[#2997ff] hover:bg-[#147ce5] text-white font-medium py-3 px-4 rounded-lg transition-all shadow-[0_0_0_1px_rgba(41,151,255,0.1)]"
          >
            Sign In
          </button>
        </form>
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
