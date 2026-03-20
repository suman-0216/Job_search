import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

export default function App({ Component, pageProps }: AppProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const auth = localStorage.getItem('auth')
    if (auth === 'true') {
      setIsAuthenticated(true)
    } else if (router.pathname !== '/login') {
      router.push('/login')
    }
  }, [router.pathname])

  if (!isAuthenticated && router.pathname !== '/login') {
    return null
  }

  return <Component {...pageProps} />
}
