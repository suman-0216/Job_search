import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const dataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) {
      return res.status(200).json([])
    }
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 5)
    const allData = files.map(f => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8')))
    res.status(200).json(allData)
  } catch (error) {
    res.status(500).json({ error: 'Failed to read data' })
  }
}
