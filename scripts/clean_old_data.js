import fs from 'fs'
import path from 'path'

const DATA_DIR = './data'
const DEFAULT_LATEST_JOBS_TIME = 5
const DEFAULT_APPLIED_JOBS_TIME = 30
const RETENTION_DAYS = Number.parseInt(process.env.LATEST_JOBS_TIME || `${DEFAULT_LATEST_JOBS_TIME}`, 10) || DEFAULT_LATEST_JOBS_TIME
const APPLIED_RETENTION_DAYS = Number.parseInt(process.env.APPLIED_JOBS_TIME || `${DEFAULT_APPLIED_JOBS_TIME}`, 10) || DEFAULT_APPLIED_JOBS_TIME
const APPLIED_FILE = 'applied_jobs.json'

const DAY_MS = 1000 * 60 * 60 * 24

const extractDateToken = (fileName) => {
  const match = fileName.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function loadAppliedJobs() {
  const appliedPath = path.join(DATA_DIR, APPLIED_FILE)
  if (!fs.existsSync(appliedPath)) return { jobs: {} }

  try {
    const parsed = JSON.parse(fs.readFileSync(appliedPath, 'utf-8'))
    return parsed?.jobs ? parsed : { jobs: {} }
  } catch {
    return { jobs: {} }
  }
}

function cleanOldData() {
  console.log(`Cleaning data files older than ${RETENTION_DAYS} days...`)
  const files = fs.readdirSync(DATA_DIR)
  const now = new Date()

  const appliedStore = loadAppliedJobs()
  const protectedDates = new Set()
  const freshAppliedJobs = {}

  Object.entries(appliedStore.jobs).forEach(([key, value]) => {
    const appliedAt = new Date(value.appliedAt || value.lastSeenAt || now.toISOString())
    const ageDays = Math.floor((now - appliedAt) / DAY_MS)

    if (ageDays <= APPLIED_RETENTION_DAYS) {
      freshAppliedJobs[key] = value
      if (value.sourceDate) protectedDates.add(value.sourceDate)
    }
  })

  const appliedPath = path.join(DATA_DIR, APPLIED_FILE)
  fs.writeFileSync(appliedPath, JSON.stringify({ jobs: freshAppliedJobs }, null, 2), 'utf-8')

  files.forEach((file) => {
    if (!file.endsWith('.json') || file === APPLIED_FILE) return

    const filePath = path.join(DATA_DIR, file)
    const stats = fs.statSync(filePath)
    const fileDate = stats.mtime
    const diffDays = Math.ceil(Math.abs(now - fileDate) / DAY_MS)
    const dateToken = extractDateToken(file)

    if (diffDays > RETENTION_DAYS && !(dateToken && protectedDates.has(dateToken))) {
      console.log(`Deleting old file: ${file} (${diffDays} days old)`)
      fs.unlinkSync(filePath)
    }
  })

  console.log('Cleanup complete.')
}

try {
  cleanOldData()
} catch (error) {
  console.error('An error occurred during cleanup:', error)
  process.exit(1)
}
