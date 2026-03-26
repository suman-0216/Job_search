import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { isSupabaseConfigured } from '../../../lib/supabaseAdmin'
import { generateResumeForUser, ResumeGenerationError } from '../../../lib/resume/generateService'

type GenerateBody = {
  jobDescription?: string
  templateMarkdown?: string
  promptA?: string
  resumeText?: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isSupabaseConfigured()) return res.status(500).json({ error: 'Supabase env is not configured' })

  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const body = (req.body || {}) as GenerateBody

  try {
    const result = await generateResumeForUser({
      userId: user.id,
      jobDescription: body.jobDescription,
      templateMarkdown: body.templateMarkdown,
      promptA: body.promptA,
      resumeText: body.resumeText,
    })
    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof ResumeGenerationError) {
      return res.status(error.status).json({ error: error.message })
    }
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate tailored resume',
    })
  }
}
