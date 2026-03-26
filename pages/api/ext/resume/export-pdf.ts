import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { getExtensionUser } from '../../../../lib/extAuthSession'
import { createResumeDocxBuffer, normalizeResumeFont, toSafeFileStem } from '../../../../lib/resume/exportDocx'

type ExportBody = {
  markdown?: string
  selectedFont?: string
  fileName?: string
}

const execFileAsync = promisify(execFile)

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
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

  const user = await getExtensionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  if (process.platform !== 'win32') {
    return res.status(501).json({ error: 'PDF export needs a Windows runtime with Microsoft Word. Use DOCX on this environment.' })
  }

  const body = (req.body || {}) as ExportBody
  const markdown = String(body.markdown || '').trim()
  if (!markdown) return res.status(400).json({ error: 'Generated markdown is required.' })

  const selectedFont = normalizeResumeFont(body.selectedFont)
  const fileStem = toSafeFileStem(String(body.fileName || 'tailored_resume'))
  const tempDir = path.join(os.tmpdir(), `resume-ext-${randomUUID()}`)
  const docxPath = path.join(tempDir, `${fileStem}.docx`)
  const pdfPath = path.join(tempDir, `${fileStem}.pdf`)

  try {
    await fs.mkdir(tempDir, { recursive: true })
    const docxBuffer = await createResumeDocxBuffer({ markdown, selectedFont })
    await fs.writeFile(docxPath, docxBuffer)
    await runWordPdfConvert(docxPath, pdfPath)
    const pdfBytes = await fs.readFile(pdfPath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', `attachment; filename="${fileStem}.pdf"`)
    return res.status(200).send(pdfBytes)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF export failed'
    return res.status(500).json({ error: message })
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

