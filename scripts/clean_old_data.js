import fs from 'fs'
import path from 'path'

const DATA_DIR = './data'
const DEFAULT_LATEST_JOBS_TIME = 5
const RETENTION_DAYS = Number.parseInt(process.env.LATEST_JOBS_TIME || `${DEFAULT_LATEST_JOBS_TIME}`, 10) || DEFAULT_LATEST_JOBS_TIME

const DAY_MS = 1000 * 60 * 60 * 24

const extractDateToken = (fileName) => {
  const match = fileName.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

const toDayStartUtc = (dateLike) => {
  const parsed = new Date(dateLike)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

const getAgeDaysFromToken = (token, now) => {
  const tokenDay = toDayStartUtc(`${token}T00:00:00.000Z`)
  const nowDay = toDayStartUtc(now.toISOString())
  if (!tokenDay || !nowDay) return null
  return Math.floor((nowDay.getTime() - tokenDay.getTime()) / DAY_MS)
}

function cleanOldData() {
  console.log(`Cleaning data files older than ${RETENTION_DAYS} days...`)
  if (!fs.existsSync(DATA_DIR)) {
    console.log('No data directory found. Skipping cleanup.')
    return
  }

  const files = fs.readdirSync(DATA_DIR)
  const now = new Date()

  files.forEach((file) => {
    if (!file.endsWith('.json')) return

    const filePath = path.join(DATA_DIR, file)
    const dateToken = extractDateToken(file)
    const diffDays = dateToken ? getAgeDaysFromToken(dateToken, now) : null

    if (diffDays === null) {
      console.log(`Skipping ${file}: could not derive date from filename.`)
      return
    }

    if (diffDays > RETENTION_DAYS) {
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
