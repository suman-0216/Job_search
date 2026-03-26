import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabaseAdmin'
import { DOCX_MIME, PDF_MIME, extractTextFromUpload, isDocxName, isPdfName, toBase64Payload } from '../../../lib/fileTextExtraction'

type UploadBody = {
  fileName?: string
  mimeType?: string
  dataUrl?: string
}

export const config = {
  api: {
    bodyParser: {
      // Base64 upload payload is larger than raw file bytes.
      // Keep this above 8MB raw-file limit enforced below.
      sizeLimit: '16mb',
    },
  },
}

const ALLOWED_MIME = new Set([PDF_MIME, DOCX_MIME])
const isMissingColumnError = (error: unknown): boolean => {
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: string }).message || '') : ''
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code || '') : ''
  return code === '42703' || code === 'PGRST204' || /column .* does not exist/i.test(message) || /could not find.*column/i.test(message)
}

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
  const mimeTypeRaw = String(body.mimeType || '').trim()
  const inferredMime = isPdfName(fileName) ? PDF_MIME : isDocxName(fileName) ? DOCX_MIME : ''
  const mimeType = mimeTypeRaw || inferredMime
  const dataUrl = String(body.dataUrl || '')

  if (!fileName || !dataUrl) {
    return res.status(400).json({ error: 'Missing file payload' })
  }

  const validByMime = !mimeTypeRaw || ALLOWED_MIME.has(mimeTypeRaw)
  const validByName = isPdfName(fileName) || isDocxName(fileName)
  if (!validByName || !validByMime) {
    return res.status(400).json({ error: 'Only PDF and DOCX files are supported.' })
  }

  const base64 = toBase64Payload(dataUrl)
  if (!base64) return res.status(400).json({ error: 'Invalid file encoding' })

  const fileBuffer = Buffer.from(base64, 'base64')
  if (!fileBuffer.length) return res.status(400).json({ error: 'Empty file' })
  if (fileBuffer.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'Resume file too large (max 8MB)' })

  try {
    const extractedText = await extractTextFromUpload(fileBuffer, fileName, mimeType)
    if (!extractedText) {
      return res.status(400).json({ error: 'Could not extract text from this file. Please try another PDF/DOCX.' })
    }

    const supabase = getSupabaseAdmin()
    const existingExtended = await supabase
      .from('user_profile_data')
      .select('personal_input,job_description,ats_prompt,template_markdown,generated_markdown,selected_font,download_file_name')
      .eq('user_id', user.id)
      .maybeSingle()
    let existing = existingExtended.data as Record<string, unknown> | null
    if (existingExtended.error && isMissingColumnError(existingExtended.error)) {
      const existingFallback = await supabase
        .from('user_profile_data')
        .select('personal_input')
        .eq('user_id', user.id)
        .maybeSingle()
      if (existingFallback.error) return res.status(500).json({ error: existingFallback.error.message })
      existing = existingFallback.data as Record<string, unknown> | null
    } else if (existingExtended.error) {
      return res.status(500).json({ error: existingExtended.error.message })
    }

    const defaultDownloadName = fileName.replace(/\.[^.]+$/, '').trim().slice(0, 180)

    const extendedUpsert = await supabase.from('user_profile_data').upsert(
      {
        user_id: user.id,
        resume_file_name: fileName,
        resume_file_mime: mimeType,
        resume_file_base64: base64,
        resume_text: extractedText.slice(0, 120_000),
        personal_input: '',
        job_description: '',
        ats_prompt: '',
        template_markdown: '',
        generated_markdown: '',
        selected_font: 'Arial',
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
          personal_input: '',
        },
        { onConflict: 'user_id' },
      )
      if (fallbackUpsert.error) return res.status(500).json({ error: fallbackUpsert.error.message })
    } else if (extendedUpsert.error) {
      return res.status(500).json({ error: extendedUpsert.error.message })
    }

    return res.status(200).json({
      ok: true,
      fileName,
      extractedText: extractedText.slice(0, 120_000),
      extractedChars: extractedText.length,
    })
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process resume',
    })
  }
}
