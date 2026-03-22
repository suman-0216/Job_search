import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  return res.status(410).json({
    ok: false,
    error: 'Verification is handled by Supabase email link. Please verify from your inbox and sign in.',
  })
}
