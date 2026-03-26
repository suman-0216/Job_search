import type { NextApiRequest } from 'next'

export const getClientIp = (req: NextApiRequest): string => {
  const forwarded = req.headers['x-forwarded-for']
  if (Array.isArray(forwarded)) return String(forwarded[0] || '').split(',')[0].trim() || 'unknown'
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim() || 'unknown'
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
  return req.socket?.remoteAddress || 'unknown'
}
