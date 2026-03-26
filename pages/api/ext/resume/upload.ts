import type { NextApiRequest, NextApiResponse } from 'next'
import { getExtensionUser } from '../../../../lib/extAuthSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../../lib/supabaseAdmin'
import { DOCX_MIME, PDF_MIME, extractTextFromUpload, isDocxName, isPdfName, toBase64Payload } from '../../../../lib/fileTextExtraction'
import { auditLog } from '../../../../lib/auditLog'

type UploadBody = {
  fileName?: string
  mimeType?: string
  dataUrl?: string
}

const ALLOWED_MIME = new Set([PDF_MIME, DOCX_MIME])
const isMissingColumnError = (error: unknown): boolean => {
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: string }).message || '') : ''
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code || '') : ''
  return code === '42703' || code === 'PGRST204' || /column .* does not exist/i.test(message) || /could not find.*column/i.test(message)
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '16mb',
    },
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isSupabaseConfigured()) return res.status(500).json({ error: 'Supabase env is not configured' })

  const user = await getExtensionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const body = (req.body || {}) as UploadBody
  const fileName = String(body.fileName || '').trim()
  const mimeTypeRaw = String(body.mimeType || '').trim()
  const inferredMime = isPdfName(fileName) ? PDF_MIME : isDocxName(fileName) ? DOCX_MIME : ''
  const mimeType = mimeTypeRaw || inferredMime
  const dataUrl = String(body.dataUrl || '')

  if (!fileName || !dataUrl) return res.status(400).json({ error: 'Missing file payload' })

  const validByMime = !mimeTypeRaw || ALLOWED_MIME.has(mimeTypeRaw)
  const validByName = isPdfName(fileName) || isDocxName(fileName)
  if (!validByName || !validByMime) return res.status(400).json({ error: 'Only PDF and DOCX files are supported.' })

  const base64 = toBase64Payload(dataUrl)
  if (!base64) return res.status(400).json({ error: 'Invalid file encoding' })

  const fileBuffer = Buffer.from(base64, 'base64')
  if (!fileBuffer.length) return res.status(400).json({ error: 'Empty file' })
  if (fileBuffer.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'Resume file too large (max 8MB)' })

  try {
    const extractedText = await extractTextFromUpload(fileBuffer, fileName, mimeType)
    if (!extractedText) return res.status(400).json({ error: 'Could not extract text from this file. Please try another PDF/DOCX.' })

    const supabase = getSupabaseAdmin()
    const defaultDownloadName = fileName.replace(/\.[^.]+$/, '').trim().slice(0, 180)

    const extendedUpsert = await supabase.from('user_profile_data').upsert(
      {
        user_id: user.id,
        resume_file_name: fileName,
        resume_file_mime: mimeType,
        resume_file_base64: base64,
        resume_text: extractedText.slice(0, 120_000),
        generated_markdown: '',
        download_file_name: defaultDownloadName || 'tailored_resume',
      },
      { onConflict: 'user_id' },
    )

    if (extendedUpsert.error && isMissingColumnError(extendedUpsert.error)) {
      const fallbackUpsert = await supabase.from('user_profile_data').upsert(
        {
          user_id: user.id,
          resume_file_name: fileName,
          resume_file_mime: mimeType,
          resume_file_base64: base64,
          resume_text: extractedText.slice(0, 120_000),
        },
        { onConflict: 'user_id' },
      )
      if (fallbackUpsert.error) return res.status(500).json({ error: fallbackUpsert.error.message })
    } else if (extendedUpsert.error) {
      return res.status(500).json({ error: extendedUpsert.error.message })
    }

    return res.status(200).json({ ok: true, fileName, extractedText: extractedText.slice(0, 120_000), extractedChars: extractedText.length })
  } catch (error) {
    auditLog('resume.upload.failed', { userId: user.id, sessionId: user.sessionId, reason: error instanceof Error ? error.message : 'unknown' })
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to process resume' })
  }
}
