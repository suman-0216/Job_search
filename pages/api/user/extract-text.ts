import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { isSupabaseConfigured } from '../../../lib/supabaseAdmin'
import {
  DOCX_MIME,
  MARKDOWN_MIME,
  PDF_MIME,
  TEXT_MIME,
  extractTextFromUpload,
  isDocxName,
  isMdName,
  isPdfName,
  isTxtName,
  toBase64Payload,
} from '../../../lib/fileTextExtraction'

type UploadBody = {
  fileName?: string
  mimeType?: string
  dataUrl?: string
}

const ALLOWED_MIME = new Set([PDF_MIME, DOCX_MIME, TEXT_MIME, MARKDOWN_MIME])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isSupabaseConfigured()) return res.status(500).json({ error: 'Supabase env is not configured' })
  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const body = (req.body || {}) as UploadBody
  const fileName = String(body.fileName || '').trim()
  const mimeType = String(body.mimeType || '').trim()
  const dataUrl = String(body.dataUrl || '')

  if (!fileName || !mimeType || !dataUrl) return res.status(400).json({ error: 'Missing file payload' })
  const validByName = isPdfName(fileName) || isDocxName(fileName) || isTxtName(fileName) || isMdName(fileName)
  const validByMime = ALLOWED_MIME.has(mimeType)
  if (!validByName && !validByMime) {
    return res.status(400).json({ error: 'Only PDF, DOCX, TXT, or MD files are supported.' })
  }

  const base64 = toBase64Payload(dataUrl)
  if (!base64) return res.status(400).json({ error: 'Invalid file encoding' })
  const fileBuffer = Buffer.from(base64, 'base64')
  if (!fileBuffer.length) return res.status(400).json({ error: 'Empty file' })
  if (fileBuffer.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 8MB)' })

  try {
    const extractedText = await extractTextFromUpload(fileBuffer, fileName, mimeType)
    if (!extractedText) {
      return res.status(400).json({ error: 'Could not extract text from this file.' })
    }
    return res.status(200).json({
      ok: true,
      fileName,
      extractedText: extractedText.slice(0, 140_000),
      extractedChars: extractedText.length,
    })
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to extract text',
    })
  }
}

