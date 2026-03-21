import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { ThemeProvider } from 'next-themes'

export default function App({ Component, pageProps }: AppProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let isMounted = true
    const checkAuth = async () => {
      if (router.pathname === '/login') {
        if (isMounted) {
          setIsCheckingAuth(false)
          setIsAuthenticated(false)
        }
        return
      }

      try {
        const response = await fetch('/api/auth/session')
        const payload = (await response.json()) as { authenticated?: boolean }
        const authenticated = Boolean(payload.authenticated)

        if (!authenticated) {
          router.push('/login')
        }

        if (isMounted) {
          setIsAuthenticated(authenticated)
        }
      } catch {
        if (isMounted) {
          setIsAuthenticated(false)
          router.push('/login')
        }
      } finally {
        if (isMounted) {
          setIsCheckingAuth(false)
        }
      }
    }

    void checkAuth()

    return () => {
      isMounted = false
    }
  }, [router.pathname, router])

  if (isCheckingAuth && router.pathname !== '/login') {
    return null
  }

  if (!isAuthenticated && router.pathname !== '/login') {
    return null
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <Component {...pageProps} />
    </ThemeProvider>
  )
}
