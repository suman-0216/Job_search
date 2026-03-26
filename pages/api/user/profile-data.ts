import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabaseAdmin'

type ProfilePayload = {
  resumeText?: string
  personalInput?: string
  jobDescription?: string
  atsPrompt?: string
  templateMarkdown?: string
  generatedMarkdown?: string
  selectedFont?: string
  downloadFileName?: string
}

const ALLOWED_FONTS = new Set(['Arial', 'Times New Roman', 'Calibri', 'Roboto', 'Garamond'])
const isMissingColumnError = (error: unknown): boolean => {
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: string }).message || '') : ''
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code || '') : ''
  return code === '42703' || /column .* does not exist/i.test(message) || /could not find.*column/i.test(message)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isSupabaseConfigured()) return res.status(500).json({ error: 'Supabase env is not configured' })
  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getSupabaseAdmin()

  if (req.method === 'GET') {
    const extendedQuery = await supabase
      .from('user_profile_data')
      .select(
        'resume_file_name,resume_text,personal_input,job_description,ats_prompt,template_markdown,generated_markdown,selected_font,download_file_name',
      )
      .eq('user_id', user.id)
      .maybeSingle()
    let data = extendedQuery.data as Record<string, unknown> | null
    if (extendedQuery.error && isMissingColumnError(extendedQuery.error)) {
      const fallbackQuery = await supabase
        .from('user_profile_data')
        .select('resume_file_name,resume_text,personal_input')
        .eq('user_id', user.id)
        .maybeSingle()
      if (fallbackQuery.error) return res.status(500).json({ error: fallbackQuery.error.message })
      data = fallbackQuery.data as Record<string, unknown> | null
    } else if (extendedQuery.error) {
      return res.status(500).json({ error: extendedQuery.error.message })
    }
    return res.status(200).json({
      resumeFileName: String(data?.resume_file_name || ''),
      resumeText: String(data?.resume_text || ''),
      personalInput: String(data?.personal_input || ''),
      jobDescription: String(data?.job_description || ''),
      atsPrompt: String(data?.ats_prompt || ''),
      templateMarkdown: String(data?.template_markdown || ''),
      generatedMarkdown: String(data?.generated_markdown || ''),
      selectedFont: String(data?.selected_font || ''),
      downloadFileName: String(data?.download_file_name || ''),
    })
  }

  if (req.method === 'POST') {
    const payload = (req.body || {}) as ProfilePayload
    const resumeTextIncoming = typeof payload.resumeText === 'string' ? payload.resumeText.slice(0, 120_000) : null
    const personalInputIncoming = typeof payload.personalInput === 'string' ? payload.personalInput.slice(0, 80_000) : null
    const jobDescriptionIncoming = typeof payload.jobDescription === 'string' ? payload.jobDescription.slice(0, 120_000) : null
    const atsPromptIncoming = typeof payload.atsPrompt === 'string' ? payload.atsPrompt.slice(0, 12_000) : null
    const templateMarkdownIncoming = typeof payload.templateMarkdown === 'string' ? payload.templateMarkdown.slice(0, 120_000) : null
    const generatedMarkdownIncoming = typeof payload.generatedMarkdown === 'string' ? payload.generatedMarkdown.slice(0, 180_000) : null
    const selectedFontCandidate = typeof payload.selectedFont === 'string' ? payload.selectedFont.slice(0, 40) : null
    const selectedFontIncoming = selectedFontCandidate && ALLOWED_FONTS.has(selectedFontCandidate) ? selectedFontCandidate : null
    const downloadFileNameIncoming = typeof payload.downloadFileName === 'string' ? payload.downloadFileName.slice(0, 180) : null

    const existingExtended = await supabase
      .from('user_profile_data')
      .select(
        'resume_file_name,resume_file_mime,resume_file_base64,resume_text,personal_input,job_description,ats_prompt,template_markdown,generated_markdown,selected_font,download_file_name',
      )
      .eq('user_id', user.id)
      .maybeSingle()
    let existing = existingExtended.data as Record<string, unknown> | null
    if (existingExtended.error && isMissingColumnError(existingExtended.error)) {
      const existingFallback = await supabase
        .from('user_profile_data')
        .select('resume_file_name,resume_file_mime,resume_file_base64,resume_text,personal_input')
        .eq('user_id', user.id)
        .maybeSingle()
      if (existingFallback.error) return res.status(500).json({ error: existingFallback.error.message })
      existing = existingFallback.data as Record<string, unknown> | null
    } else if (existingExtended.error) {
      return res.status(500).json({ error: existingExtended.error.message })
    }

    const upsertPayload = {
      user_id: user.id,
      resume_file_name: String(existing?.resume_file_name || ''),
      resume_file_mime: String(existing?.resume_file_mime || ''),
      resume_file_base64: String(existing?.resume_file_base64 || ''),
      resume_text: resumeTextIncoming ?? String(existing?.resume_text || ''),
      personal_input: personalInputIncoming ?? String(existing?.personal_input || ''),
      job_description: jobDescriptionIncoming ?? String((existing as { job_description?: string } | null)?.job_description || ''),
      ats_prompt: atsPromptIncoming ?? String((existing as { ats_prompt?: string } | null)?.ats_prompt || ''),
      template_markdown: templateMarkdownIncoming ?? String((existing as { template_markdown?: string } | null)?.template_markdown || ''),
      generated_markdown: generatedMarkdownIncoming ?? String((existing as { generated_markdown?: string } | null)?.generated_markdown || ''),
      selected_font: selectedFontIncoming ?? String((existing as { selected_font?: string } | null)?.selected_font || 'Calibri'),
      download_file_name: downloadFileNameIncoming ?? String((existing as { download_file_name?: string } | null)?.download_file_name || ''),
    }

    const extendedUpsert = await supabase.from('user_profile_data').upsert(
      upsertPayload,
      { onConflict: 'user_id' },
    )
    if (extendedUpsert.error && isMissingColumnError(extendedUpsert.error)) {
      const fallbackUpsert = await supabase.from('user_profile_data').upsert(
        {
          user_id: user.id,
          resume_file_name: String(existing?.resume_file_name || ''),
          resume_file_mime: String(existing?.resume_file_mime || ''),
          resume_file_base64: String(existing?.resume_file_base64 || ''),
          resume_text: resumeTextIncoming ?? String(existing?.resume_text || ''),
          personal_input: personalInputIncoming ?? String(existing?.personal_input || ''),
        },
        { onConflict: 'user_id' },
      )
      if (fallbackUpsert.error) return res.status(500).json({ error: fallbackUpsert.error.message })
      return res.status(200).json({ ok: true, warning: 'Fallback save used. Run latest Supabase schema for full profile persistence.' })
    }
    if (extendedUpsert.error) return res.status(500).json({ error: extendedUpsert.error.message })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET,POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
