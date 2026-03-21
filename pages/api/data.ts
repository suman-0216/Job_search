import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'

const DEFAULT_LATEST_JOBS_TIME = 5

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const dataDir = path.join(process.cwd(), 'data')
    console.log("Checking data directory:", dataDir)
    const latestWindowDays = Number.parseInt(process.env.LATEST_JOBS_TIME || `${DEFAULT_LATEST_JOBS_TIME}`, 10) || DEFAULT_LATEST_JOBS_TIME

    if (!fs.existsSync(dataDir)) {
      console.log("Data directory does not exist")
      return res.status(200).json({ days: [], latestWindowDays })
    }

    const files = fs
      .readdirSync(dataDir)
      .filter((f) => f.endsWith('.json') && f !== 'applied_jobs.json')
      .sort()
      .reverse()
      .slice(0, latestWindowDays)
    console.log("Found files:", files)

    const allData = files.map(f => {
      const filePath = path.join(dataDir, f)
      const content = fs.readFileSync(filePath, 'utf-8')
      try {
        const parsed = JSON.parse(content)
        const fileDate = f.replace('.json', '').replace('jobs_', '').slice(0, 10)

        // If it's a raw array of jobs, wrap it in a dashboard day object
        if (Array.isArray(parsed)) {
          return {
            date: fileDate,
            jobs: parsed,
            funded: [],
            stealth: []
          }
        }
        return {
          ...parsed,
          date: parsed.date || fileDate,
          jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
          funded: Array.isArray(parsed.funded) ? parsed.funded : (Array.isArray(parsed.funded_startups) ? parsed.funded_startups : []),
          stealth: Array.isArray(parsed.stealth) ? parsed.stealth : (Array.isArray(parsed.stealth_startups) ? parsed.stealth_startups : []),
        }
      } catch (e) {
        console.error(`Failed to parse ${f}:`, e)
        return null
      }
    }).filter(Boolean)

    res.status(200).json({ days: allData, latestWindowDays })
  } catch (error) {
    console.error("API error:", error)
    res.status(500).json({ error: 'Failed to read data' })
  }
}
