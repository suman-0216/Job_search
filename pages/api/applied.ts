import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'

interface AppliedJob {
  jobKey: string
  title: string
  company: string
  link: string
  sourceDate: string
  appliedAt: string
  lastSeenAt: string
}

interface AppliedStore {
  jobs: Record<string, AppliedJob>
}

const APPLIED_FILE = path.join(process.cwd(), 'data', 'applied_jobs.json')
const DEFAULT_APPLIED_JOBS_TIME = 30
const DAY_MS = 1000 * 60 * 60 * 24

const ensureStore = (): AppliedStore => {
  const dir = path.dirname(APPLIED_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  if (!fs.existsSync(APPLIED_FILE)) {
    const empty: AppliedStore = { jobs: {} }
    fs.writeFileSync(APPLIED_FILE, JSON.stringify(empty, null, 2), 'utf-8')
    return empty
  }

  try {
    const raw = fs.readFileSync(APPLIED_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as AppliedStore
    return parsed?.jobs ? parsed : { jobs: {} }
  } catch {
    return { jobs: {} }
  }
}

const saveStore = (store: AppliedStore) => {
  fs.writeFileSync(APPLIED_FILE, JSON.stringify(store, null, 2), 'utf-8')
}

const pruneAppliedStore = (store: AppliedStore, retentionDays: number): AppliedStore => {
  const now = new Date()
  const jobs = Object.fromEntries(
    Object.entries(store.jobs).filter(([, value]) => {
      const baseDate = new Date(value.appliedAt || value.lastSeenAt || now.toISOString())
      const age = Math.floor((now.getTime() - baseDate.getTime()) / DAY_MS)
      return age <= retentionDays
    }),
  )
  return { jobs }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const retentionDays = Number.parseInt(process.env.APPLIED_JOBS_TIME || `${DEFAULT_APPLIED_JOBS_TIME}`, 10) || DEFAULT_APPLIED_JOBS_TIME
    const store = pruneAppliedStore(ensureStore(), retentionDays)
    saveStore(store)

    if (req.method === 'GET') {
      return res.status(200).json({ jobs: store.jobs })
    }

    if (req.method === 'POST') {
      const { jobKey, title, company, link, sourceDate, applied } = req.body as {
        jobKey?: string
        title?: string
        company?: string
        link?: string
        sourceDate?: string
        applied?: boolean
      }

      if (!jobKey) return res.status(400).json({ error: 'jobKey is required' })

      if (applied) {
        const now = new Date().toISOString()
        store.jobs[jobKey] = {
          jobKey,
          title: title || '',
          company: company || '',
          link: link || '',
          sourceDate: sourceDate || '',
          appliedAt: store.jobs[jobKey]?.appliedAt || now,
          lastSeenAt: now,
        }
      } else {
        delete store.jobs[jobKey]
      }

      saveStore(store)
      return res.status(200).json({ jobs: store.jobs })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Applied API error:', error)
    return res.status(500).json({ error: 'Failed to process applied jobs' })
  }
}
