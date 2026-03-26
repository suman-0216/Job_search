import type { NextApiRequest, NextApiResponse } from 'next'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

type ConvertBody = {
  fileName?: string
  docxBase64?: string
}

const execFileAsync = promisify(execFile)

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}

const safeStem = (input: string): string => {
  const value = String(input || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return value || 'resume'
}

const psQuote = (value: string): string => `'${String(value || '').replace(/'/g, "''")}'`

const runWordPdfConvert = async (sourceDocxPath: string, targetPdfPath: string): Promise<void> => {
  const script = `
$ErrorActionPreference = 'Stop'
$sourcePath = ${psQuote(sourceDocxPath)}
$targetPath = ${psQuote(targetPdfPath)}
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($sourcePath, $false, $true)
  $doc.SaveAs([ref]$targetPath, [ref]17)
}
finally {
  if ($doc -ne $null) { $doc.Close([ref]$false) }
  if ($word -ne $null) { $word.Quit() }
}
`

  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    timeout: 120000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (process.platform !== 'win32') {
    return res.status(501).json({ error: 'Word-based PDF conversion requires a Windows runtime with Microsoft Word installed.' })
  }

  const body = (req.body || {}) as ConvertBody
  const base64 = String(body.docxBase64 || '').trim()
  if (!base64) return res.status(400).json({ error: 'docxBase64 is required' })

  const fileStem = safeStem(String(body.fileName || 'resume'))
  const tempDir = path.join(os.tmpdir(), `resume-word-${randomUUID()}`)
  const docxPath = path.join(tempDir, `${fileStem}.docx`)
  const pdfPath = path.join(tempDir, `${fileStem}.pdf`)

  try {
    await fs.mkdir(tempDir, { recursive: true })
    const docxBytes = Buffer.from(base64, 'base64')
    await fs.writeFile(docxPath, docxBytes)
    await runWordPdfConvert(docxPath, pdfPath)
    const pdfBytes = await fs.readFile(pdfPath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', `attachment; filename="${fileStem}.pdf"`)
    return res.status(200).send(pdfBytes)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown conversion failure'
    return res.status(500).json({ error: `Word conversion failed: ${message}` })
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

