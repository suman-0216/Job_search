import type { NextApiRequest, NextApiResponse } from 'next'
import { getExtensionUser } from '../../../../lib/extAuthSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../../lib/supabaseAdmin'

const ALLOWED_FONTS = new Set(['Arial', 'Times New Roman', 'Calibri', 'Roboto', 'Garamond'])
const isMissingColumnError = (error: unknown): boolean => {
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: string }).message || '') : ''
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code || '') : ''
  return code === '42703' || /column .* does not exist/i.test(message) || /could not find.*column/i.test(message)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isSupabaseConfigured()) return res.status(500).json({ error: 'Supabase env is not configured' })

  const user = await getExtensionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getSupabaseAdmin()

  if (req.method === 'GET') {
    const extendedQuery = await supabase
      .from('user_profile_data')
      .select('resume_file_name,resume_text,job_description,ats_prompt,template_markdown,generated_markdown,selected_font,download_file_name')
      .eq('user_id', user.id)
      .maybeSingle()

    let data = extendedQuery.data as Record<string, unknown> | null
    if (extendedQuery.error && isMissingColumnError(extendedQuery.error)) {
      const fallback = await supabase
        .from('user_profile_data')
        .select('resume_file_name,resume_text')
        .eq('user_id', user.id)
        .maybeSingle()
      if (fallback.error) return res.status(500).json({ error: fallback.error.message })
      data = fallback.data as Record<string, unknown> | null
    } else if (extendedQuery.error) {
      return res.status(500).json({ error: extendedQuery.error.message })
    }

    return res.status(200).json({
      resumeFileName: String(data?.resume_file_name || ''),
      resumeText: String(data?.resume_text || ''),
      jobDescription: String(data?.job_description || ''),
      atsPrompt: String(data?.ats_prompt || ''),
      templateMarkdown: String(data?.template_markdown || ''),
      generatedMarkdown: String(data?.generated_markdown || ''),
      selectedFont: String(data?.selected_font || 'Calibri'),
      downloadFileName: String(data?.download_file_name || ''),
    })
  }

  if (req.method === 'PUT') {
    const resumeText = typeof req.body?.resumeText === 'string' ? req.body.resumeText.slice(0, 120_000) : null
    const jobDescription = typeof req.body?.jobDescription === 'string' ? req.body.jobDescription.slice(0, 120_000) : null
    const atsPrompt = typeof req.body?.atsPrompt === 'string' ? req.body.atsPrompt.slice(0, 12_000) : null
    const templateMarkdown = typeof req.body?.templateMarkdown === 'string' ? req.body.templateMarkdown.slice(0, 120_000) : null
    const generatedMarkdown = typeof req.body?.generatedMarkdown === 'string' ? req.body.generatedMarkdown.slice(0, 180_000) : null
    const selectedFontRaw = typeof req.body?.selectedFont === 'string' ? req.body.selectedFont.trim().slice(0, 40) : null
    const selectedFont = selectedFontRaw && ALLOWED_FONTS.has(selectedFontRaw) ? selectedFontRaw : null
    const downloadFileName = typeof req.body?.downloadFileName === 'string' ? req.body.downloadFileName.slice(0, 180) : null

    const existing = await supabase
      .from('user_profile_data')
      .select('resume_file_name,resume_file_mime,resume_file_base64,resume_text,job_description,ats_prompt,template_markdown,generated_markdown,selected_font,download_file_name')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing.error && !isMissingColumnError(existing.error)) return res.status(500).json({ error: existing.error.message })

    const row = (existing.data || {}) as Record<string, unknown>
    const upsert = await supabase.from('user_profile_data').upsert(
      {
        user_id: user.id,
        resume_file_name: String(row.resume_file_name || ''),
        resume_file_mime: String(row.resume_file_mime || ''),
        resume_file_base64: String(row.resume_file_base64 || ''),
        resume_text: resumeText ?? String(row.resume_text || ''),
        job_description: jobDescription ?? String(row.job_description || ''),
        ats_prompt: atsPrompt ?? String(row.ats_prompt || ''),
        template_markdown: templateMarkdown ?? String(row.template_markdown || ''),
        generated_markdown: generatedMarkdown ?? String(row.generated_markdown || ''),
        selected_font: selectedFont ?? String(row.selected_font || 'Calibri'),
        download_file_name: downloadFileName ?? String(row.download_file_name || ''),
      },
      { onConflict: 'user_id' },
    )

    if (upsert.error && isMissingColumnError(upsert.error)) {
      const fallback = await supabase.from('user_profile_data').upsert(
        {
          user_id: user.id,
          resume_file_name: String(row.resume_file_name || ''),
          resume_file_mime: String(row.resume_file_mime || ''),
          resume_file_base64: String(row.resume_file_base64 || ''),
          resume_text: resumeText ?? String(row.resume_text || ''),
        },
        { onConflict: 'user_id' },
      )
      if (fallback.error) return res.status(500).json({ error: fallback.error.message })
      return res.status(200).json({ ok: true, warning: 'Fallback save used. Run latest schema for full draft fields.' })
    }

    if (upsert.error) return res.status(500).json({ error: upsert.error.message })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, PUT')
  return res.status(405).json({ error: 'Method not allowed' })
}
