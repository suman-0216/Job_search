import type { NextApiRequest, NextApiResponse } from 'next'
import { getExtensionUser } from '../../../../lib/extAuthSession'
import { createResumeDocxBuffer, normalizeResumeFont, toSafeFileStem } from '../../../../lib/resume/exportDocx'

type ExportBody = {
  markdown?: string
  selectedFont?: string
  fileName?: string
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getExtensionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const body = (req.body || {}) as ExportBody
  const markdown = String(body.markdown || '').trim()
  if (!markdown) return res.status(400).json({ error: 'Generated markdown is required.' })

  const selectedFont = normalizeResumeFont(body.selectedFont)
  const fileStem = toSafeFileStem(String(body.fileName || 'tailored_resume'))

  try {
    const buffer = await createResumeDocxBuffer({ markdown, selectedFont })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', `attachment; filename="${fileStem}.docx"`)
    return res.status(200).send(buffer)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build DOCX'
    return res.status(500).json({ error: message })
  }
}

