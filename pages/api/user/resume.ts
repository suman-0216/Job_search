import type { NextApiRequest, NextApiResponse } from 'next'
import mammoth from 'mammoth'
import * as pdfParseModule from 'pdf-parse'
import { getSessionUser } from '../../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabaseAdmin'

type UploadBody = {
  fileName?: string
  mimeType?: string
  dataUrl?: string
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const isDocxName = (name: string): boolean => name.toLowerCase().endsWith('.docx')
const isPdfName = (name: string): boolean => name.toLowerCase().endsWith('.pdf')

const toBase64Payload = (dataUrl: string): string => {
  const marker = 'base64,'
  const index = dataUrl.indexOf(marker)
  if (index < 0) return ''
  return dataUrl.slice(index + marker.length)
}

const normalizeExtractedText = (raw: string): string =>
  String(raw || '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const parsePdfText = async (fileBuffer: Buffer): Promise<string> => {
  const parser = ((pdfParseModule as unknown as { default?: unknown }).default || pdfParseModule) as (
    buffer: Buffer,
  ) => Promise<{ text?: string }>
  const parsed = await parser(fileBuffer)
  return normalizeExtractedText(parsed.text || '')
}

const extractTextFromResume = async (fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string> => {
  if (mimeType === 'application/pdf' || isPdfName(fileName)) {
    return parsePdfText(fileBuffer)
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || isDocxName(fileName)) {
    const parsed = await mammoth.extractRawText({ buffer: fileBuffer })
    return normalizeExtractedText(parsed.value || '')
  }
  return ''
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
  const mimeType = String(body.mimeType || '').trim()
  const dataUrl = String(body.dataUrl || '')

  if (!fileName || !mimeType || !dataUrl) {
    return res.status(400).json({ error: 'Missing file payload' })
  }

  const validByMime = ALLOWED_MIME.has(mimeType)
  const validByName = isPdfName(fileName) || isDocxName(fileName)
  if (!validByMime || !validByName) {
    return res.status(400).json({ error: 'Only PDF and DOCX files are supported.' })
  }

  const base64 = toBase64Payload(dataUrl)
  if (!base64) return res.status(400).json({ error: 'Invalid file encoding' })

  const fileBuffer = Buffer.from(base64, 'base64')
  if (!fileBuffer.length) return res.status(400).json({ error: 'Empty file' })
  if (fileBuffer.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'Resume file too large (max 8MB)' })

  try {
    const extractedText = await extractTextFromResume(fileBuffer, fileName, mimeType)
    if (!extractedText) {
      return res.status(400).json({ error: 'Could not extract text from this file. Please try another PDF/DOCX.' })
    }

    const supabase = getSupabaseAdmin()
    const { data: existing } = await supabase
      .from('user_profile_data')
      .select('personal_input')
      .eq('user_id', user.id)
      .maybeSingle()

    const { error } = await supabase.from('user_profile_data').upsert(
      {
        user_id: user.id,
        resume_file_name: fileName,
        resume_file_mime: mimeType,
        resume_file_base64: base64,
        resume_text: extractedText.slice(0, 120_000),
        personal_input: String(existing?.personal_input || ''),
      },
      { onConflict: 'user_id' },
    )
    if (error) return res.status(500).json({ error: error.message })

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
