import type { NextApiRequest, NextApiResponse } from 'next'
import { getExtensionUser } from '../../../lib/extAuthSession'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await getExtensionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  return res.status(200).json({
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
  })
}
