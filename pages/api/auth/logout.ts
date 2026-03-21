import type { NextApiRequest, NextApiResponse } from 'next'

const COOKIE_NAME = 'job_hunt_auth'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const isProd = process.env.NODE_ENV === 'production'
  const cookie = `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`
  res.setHeader('Set-Cookie', cookie)
  return res.status(200).json({ ok: true })
}
