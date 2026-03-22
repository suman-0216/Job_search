import fs from 'fs'
import path from 'path'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DATA_DIR = path.join(process.cwd(), 'data')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const extractDateToken = (fileName) => {
  const match = fileName.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

const parseSnapshot = (content, dateToken) => {
  if (Array.isArray(content)) {
    return {
      snapshot_date: dateToken,
      scraped_at: new Date().toISOString(),
      timestamp: `${dateToken}-import`,
      jobs: content,
      funded: [],
      stealth: [],
      source_stats: {},
    }
  }

  return {
    snapshot_date: dateToken || content.date,
    scraped_at: content.scrapedAt || new Date().toISOString(),
    timestamp: content.timestamp || `${dateToken}-import`,
    jobs: Array.isArray(content.jobs) ? content.jobs : [],
    funded: Array.isArray(content.funded) ? content.funded : (Array.isArray(content.funded_startups) ? content.funded_startups : []),
    stealth: Array.isArray(content.stealth) ? content.stealth : (Array.isArray(content.stealth_startups) ? content.stealth_startups : []),
    source_stats: content.source_stats || {},
  }
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.log('No data directory found. Nothing to sync.')
    return
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith('.json') && file !== 'applied_jobs.json')
    .sort()

  let synced = 0
  for (const file of files) {
    const fullPath = path.join(DATA_DIR, file)
    const dateToken = extractDateToken(file)
    if (!dateToken) continue

    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
      const payload = parseSnapshot(parsed, dateToken)
      if (!payload.snapshot_date) continue

      const { error } = await supabase.from('job_snapshots').upsert(payload, { onConflict: 'snapshot_date' })
      if (error) throw error
      synced += 1
    } catch (error) {
      console.error(`Failed to sync ${file}:`, error)
    }
  }

  console.log(`Synced ${synced} snapshot(s) to Supabase.`)
}

main().catch((error) => {
  console.error('Sync failed:', error)
  process.exit(1)
})

