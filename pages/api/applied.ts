import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../lib/supabaseAdmin'

const DEFAULT_APPLIED_JOBS_TIME = 30

interface AppliedJobRow {
  job_key: string
  title: string
  company: string
  link: string
  source_date: string | null
  applied_at: string
  last_seen_at: string
  status: string
}

const normalizeJobs = (rows: AppliedJobRow[]) =>
  rows.reduce<Record<string, unknown>>((acc, row) => {
    acc[row.job_key] = {
      jobKey: row.job_key,
      title: row.title,
      company: row.company,
      link: row.link,
      sourceDate: row.source_date || '',
      appliedAt: row.applied_at,
      lastSeenAt: row.last_seen_at,
      status: row.status || 'applied',
    }
    return acc
  }, {})

async function fetchAppliedJobs(userId: string) {
  const supabase = getSupabaseAdmin()
  const retentionDays = Number.parseInt(process.env.APPLIED_JOBS_TIME || `${DEFAULT_APPLIED_JOBS_TIME}`, 10) || DEFAULT_APPLIED_JOBS_TIME
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

  await supabase.from('applied_jobs').delete().eq('user_id', userId).lt('applied_at', cutoff)

  const { data, error } = await supabase
    .from('applied_jobs')
    .select('job_key,title,company,link,source_date,applied_at,last_seen_at,status')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false })

  if (error) throw new Error(`Failed to load applied jobs: ${error.message}`)
  return normalizeJobs((data || []) as AppliedJobRow[])
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ error: 'Supabase env is not configured' })
  }

  const sessionUser = await getSessionUser(req)
  if (!sessionUser) return res.status(401).json({ error: 'Unauthorized' })
  const userId = sessionUser.id

  if (req.method === 'GET') {
    try {
      const jobs = await fetchAppliedJobs(userId)
      return res.status(200).json({ jobs })
    } catch (error) {
      console.error('Applied API GET error:', error)
      return res.status(500).json({ error: 'Failed to load applied jobs' })
    }
  }

  if (req.method === 'POST') {
    const { jobKey, title, company, link, sourceDate, applied, status } = req.body as {
      jobKey?: string
      title?: string
      company?: string
      link?: string
      sourceDate?: string
      applied?: boolean
      status?: string
    }

    if (!jobKey) return res.status(400).json({ error: 'jobKey is required' })

    try {
      const supabase = getSupabaseAdmin()
      if (applied) {
        const now = new Date().toISOString()
        const { error } = await supabase.from('applied_jobs').upsert(
          {
            user_id: userId,
            job_key: jobKey,
            title: title || '',
            company: company || '',
            link: link || '',
            source_date: sourceDate || null,
            last_seen_at: now,
            status: status || 'applied',
          },
          { onConflict: 'user_id,job_key' },
        )
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('applied_jobs').delete().eq('user_id', userId).eq('job_key', jobKey)
        if (error) throw new Error(error.message)
      }

      const jobs = await fetchAppliedJobs(userId)
      return res.status(200).json({ jobs })
    } catch (error) {
      console.error('Applied API POST error:', error)
      return res.status(500).json({ error: 'Failed to update applied jobs' })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

