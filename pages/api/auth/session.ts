import type { NextApiRequest, NextApiResponse } from 'next'

const COOKIE_NAME = 'job_hunt_auth'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawCookie = req.headers.cookie || ''
  const isAuthenticated = rawCookie
    .split(';')
    .map((part) => part.trim())
    .some((part) => part === `${COOKIE_NAME}=1`)

  return res.status(200).json({ authenticated: isAuthenticated })
}
