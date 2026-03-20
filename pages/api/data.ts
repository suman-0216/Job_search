import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const dataDir = path.join(process.cwd(), 'data')
    console.log("Checking data directory:", dataDir)

    if (!fs.existsSync(dataDir)) {
      console.log("Data directory does not exist")
      return res.status(200).json([])
    }

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 5)
    console.log("Found files:", files)

    const allData = files.map(f => {
      const filePath = path.join(dataDir, f)
      const content = fs.readFileSync(filePath, 'utf-8')
      try {
        const parsed = JSON.parse(content)
        // Ensure the parsed data follows the expected dashboard structure
        // If it's a raw array of jobs, wrap it in a dashboard day object
        if (Array.isArray(parsed)) {
          return {
            date: f.replace('.json', '').replace('jobs_', ''),
            jobs: parsed,
            funded: [],
            stealth: []
          }
        }
        return parsed
      } catch (e) {
        console.error(`Failed to parse ${f}:`, e)
        return null
      }
    }).filter(Boolean)

    res.status(200).json(allData)
  } catch (error) {
    console.error("API error:", error)
    res.status(500).json({ error: 'Failed to read data' })
  }
}
