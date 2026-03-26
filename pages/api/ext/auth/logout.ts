import type { NextApiRequest, NextApiResponse } from 'next'
import { revokeExtensionSessionFromRequest } from '../../../../lib/extAuthSession'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  await revokeExtensionSessionFromRequest(req)
  return res.status(200).json({ ok: true })
}
