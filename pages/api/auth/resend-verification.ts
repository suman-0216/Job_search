import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAuthClient, isSupabaseAuthConfigured, isSupabaseConfigured } from '../../../lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  if (!isSupabaseConfigured() || !isSupabaseAuthConfigured()) {
    return res.status(500).json({ ok: false, error: 'Supabase env is not configured' })
  }

  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Valid email is required' })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_APP_URL || 'http://localhost:3000'
    const authClient = getSupabaseAuthClient()

    const { error } = await authClient.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: appUrl,
      },
    })

    if (error) {
      return res.status(400).json({ ok: false, error: error.message || 'Failed to resend verification email' })
    }

    return res.status(200).json({
      ok: true,
      message: 'Verification email sent. Please check inbox/spam.',
    })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to resend verification email',
    })
  }
}

