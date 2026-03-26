import type { NextApiRequest, NextApiResponse } from 'next'
import { getExtensionUser } from '../../../../lib/extAuthSession'
import { isSupabaseConfigured } from '../../../../lib/supabaseAdmin'
import { generateResumeForUser, ResumeGenerationError } from '../../../../lib/resume/generateService'
import { getClientIp } from '../../../../lib/requestMeta'
import { isRateLimited } from '../../../../lib/rateLimit'
import { auditLog } from '../../../../lib/auditLog'

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

  const user = await getExtensionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const ip = getClientIp(req)
  if (isRateLimited(`ext:resume:generate:user:${user.id}`, 12, 5 * 60_000) || isRateLimited(`ext:resume:generate:ip:${ip}`, 24, 5 * 60_000)) {
    auditLog('resume.generate.rate_limited', { userId: user.id, sessionId: user.sessionId, ip })
    return res.status(429).json({ error: 'Too many generate requests. Please try again shortly.' })
  }

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
      if (error.status >= 500) {
        auditLog('resume.generate.failed', { userId: user.id, sessionId: user.sessionId, reason: error.message })
      }
      return res.status(error.status).json({ error: error.message })
    }
    const message = error instanceof Error ? error.message : 'Failed to generate tailored resume'
    auditLog('resume.generate.error', { userId: user.id, sessionId: user.sessionId, reason: message })
    return res.status(500).json({ error: message })
  }
}
