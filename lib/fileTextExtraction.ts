import mammoth from 'mammoth'
import * as pdfParseModule from 'pdf-parse'

export const PDF_MIME = 'application/pdf'
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const TEXT_MIME = 'text/plain'
export const MARKDOWN_MIME = 'text/markdown'

const toStringValue = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export const isPdfName = (name: string): boolean => name.toLowerCase().endsWith('.pdf')
export const isDocxName = (name: string): boolean => name.toLowerCase().endsWith('.docx')
export const isTxtName = (name: string): boolean => name.toLowerCase().endsWith('.txt')
export const isMdName = (name: string): boolean => name.toLowerCase().endsWith('.md')

export const normalizeExtractedText = (raw: string): string =>
  String(raw || '')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/â€¢/g, '•')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const stripHtmlTags = (value: string): string => String(value || '').replace(/<[^>]+>/g, '')

const decodeHtmlEntities = (value: string): string =>
  String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

const normalizeWhitespaceLine = (line: string): string => String(line || '').replace(/[ \t]+/g, ' ').trim()
const KNOWN_SECTION_TITLES = ['SUMMARY', 'WORK EXPERIENCE', 'EXPERIENCE', 'TECHNICAL SKILLS', 'SKILLS', 'PROJECT EXPERIENCE', 'PROJECTS', 'EDUCATION', 'CERTIFICATIONS']

const normalizeHeadingCandidate = (line: string): string =>
  normalizeWhitespaceLine(line)
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/\*\*/g, '')
    .replace(/:$/, '')
    .trim()

const isLikelyHeadingLine = (line: string): boolean => {
  const text = normalizeHeadingCandidate(line)
  if (!text) return false
  if (/^(summary|work experience|experience|technical skills|skills|project experience|projects|education|certifications?)$/i.test(text)) return true
  return /^[A-Z][A-Z0-9 &/()+,.\-]{2,}$/.test(text) && text.length <= 80
}

const isBulletLine = (line: string): boolean => /^(\s*)([-*]|\d+[.)])\s+/.test(line)

const normalizeBullets = (text: string): string =>
  String(text || '')
    .replace(/^[ \t]*[•●▪◦]\s+/gm, '- ')
    .replace(/^[ \t]*\u2022\s+/gm, '- ')

const isolateKnownSectionHeadings = (text: string): string => {
  const lines = String(text || '').replace(/\r/g, '\n').split('\n')
  const out: string[] = []

  for (const rawLine of lines) {
    let line = rawLine
    let safety = 0
    while (safety < 12) {
      safety += 1
      if (!line.trim()) {
        out.push('')
        break
      }

      const upper = line.toUpperCase()
      let best: { index: number; length: number } | null = null
      for (const heading of KNOWN_SECTION_TITLES) {
        const boldToken = `**${heading}**`
        const plainIndex = upper.indexOf(heading)
        const boldIndex = upper.indexOf(boldToken)
        const candidates = [plainIndex, boldIndex].filter((value) => value >= 0)
        if (!candidates.length) continue
        const index = Math.min(...candidates)
        const length = boldIndex === index ? boldToken.length : heading.length
        if (!best || index < best.index) best = { index, length }
      }

      if (!best) {
        out.push(line.trim())
        break
      }

      const before = line.slice(0, best.index).trimEnd()
      const token = line.slice(best.index, best.index + best.length).trim()
      const after = line.slice(best.index + best.length).trimStart()

      if (before) out.push(before)
      out.push(token)
      if (!after) break
      line = after
    }
  }

  return out.join('\n')
}

const unwrapWrappedLines = (text: string): string => {
  const lines = String(text || '').replace(/\r/g, '\n').split('\n')
  const out: string[] = []

  for (const raw of lines) {
    const line = normalizeWhitespaceLine(raw)
    if (!line) {
      if (out.length && out[out.length - 1] !== '') out.push('')
      continue
    }

    if (out.length === 0) {
      out.push(line)
      continue
    }

    const prev = out[out.length - 1]
    const currentLooksSpecial = isLikelyHeadingLine(line) || isBulletLine(line) || /@|\|/.test(line)
    const prevLooksSpecial = isLikelyHeadingLine(prev) || isBulletLine(prev) || /@|\|/.test(prev)
    const shouldJoin =
      !currentLooksSpecial &&
      !prevLooksSpecial &&
      !/[.:;!?]$/.test(prev) &&
      /^[a-z0-9(]/.test(line) &&
      prev.length < 170

    if (shouldJoin) {
      out[out.length - 1] = `${prev} ${line}`
    } else {
      out.push(line)
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const postProcessExtractedText = (text: string): string => {
  const bullets = normalizeBullets(text)
  const unwrapped = unwrapWrappedLines(bullets)
  const isolated = isolateKnownSectionHeadings(unwrapped)
  return normalizeExtractedText(isolated)
}

const extractedSectionCoverage = (text: string): number => {
  const lines = String(text || '').replace(/\r/g, '\n').split('\n')
  const seen = new Set<string>()
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const normalized = normalizeHeadingCandidate(line).toUpperCase()
    for (const heading of KNOWN_SECTION_TITLES) {
      if (normalized === heading) {
        seen.add(heading)
        break
      }
    }
  }
  return seen.size
}

const extractedBulletCount = (text: string): number => {
  const lines = String(text || '').replace(/\r/g, '\n').split('\n')
  return lines.filter((line) => /^(\s*)([-*]|\d+[.)])\s+/.test(line)).length
}

const extractedQualityScore = (text: string): number => {
  const normalized = normalizeExtractedText(text)
  if (!normalized) return 0
  const sectionScore = extractedSectionCoverage(normalized) * 2_000
  const bulletScore = extractedBulletCount(normalized) * 35
  const lengthScore = Math.min(normalized.length, 200_000)
  return sectionScore + bulletScore + lengthScore
}

const htmlToMarkdownish = (html: string): string => {
  let output = String(html || '').replace(/\r/g, '')

  output = output.replace(/<br\s*\/?>/gi, '\n')

  output = output.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, _level: string, inner: string) => {
    const text = decodeHtmlEntities(stripHtmlTags(inner)).trim()
    return text ? `\n${text.toUpperCase()}\n` : '\n'
  })

  output = output.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_match, inner: string) => {
    let idx = 0
    const list = String(inner || '').replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_li, item: string) => {
      idx += 1
      const itemText = decodeHtmlEntities(stripHtmlTags(item)).trim()
      return itemText ? `${idx}. ${itemText}\n` : ''
    })
    return `${list}\n`
  })

  output = output.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_match, inner: string) => {
    const list = String(inner || '').replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_li, item: string) => {
      const itemText = decodeHtmlEntities(stripHtmlTags(item)).trim()
      return itemText ? `- ${itemText}\n` : ''
    })
    return `${list}\n`
  })

  output = output.replace(/<a[^>]*href=(?:"|')([^"']+)(?:"|')[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, text: string) => {
    const label = decodeHtmlEntities(stripHtmlTags(text)).trim() || href
    return `[${label}](${href})`
  })

  output = output.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, text: string) => {
    const content = decodeHtmlEntities(stripHtmlTags(text)).trim()
    return content ? `**${content}**` : ''
  })

  output = output
    .replace(/<\/(p|div|h[1-6]|section|article|header|footer|tr)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|section|article|header|footer|tr)[^>]*>/gi, '')

  output = output.replace(/<[^>]+>/g, '')
  output = decodeHtmlEntities(output)

  return postProcessExtractedText(output.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n'))
}

const parsePdfText = async (fileBuffer: Buffer): Promise<string> => {
  const direct = pdfParseModule as unknown as ((data: Buffer | Uint8Array) => Promise<{ text?: string }>)
  if (typeof direct === 'function') {
    const parsed = await direct(fileBuffer)
    return postProcessExtractedText(parsed?.text || '')
  }

  const lib = pdfParseModule as unknown as {
    default?: (data: Buffer | Uint8Array) => Promise<{ text?: string }>
    PDFParse?: new (options: { data: Uint8Array }) => { getText: () => Promise<{ text?: string }>; destroy: () => Promise<void> }
  }

  if (typeof lib.default === 'function') {
    const parsed = await lib.default(fileBuffer)
    return postProcessExtractedText(parsed?.text || '')
  }

  if (typeof lib.PDFParse === 'function') {
    const parser = new lib.PDFParse({ data: new Uint8Array(fileBuffer) })
    try {
      const parsed = await parser.getText()
      return postProcessExtractedText(parsed?.text || '')
    } finally {
      await parser.destroy().catch(() => undefined)
    }
  }

  throw new Error('PDF parser is not available. Check pdf-parse installation.')
}

export const toBase64Payload = (dataUrl: string): string => {
  const marker = 'base64,'
  const index = dataUrl.indexOf(marker)
  if (index < 0) return ''
  return dataUrl.slice(index + marker.length)
}

export const extractTextFromUpload = async (fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string> => {
  const safeName = toStringValue(fileName)
  const safeMime = toStringValue(mimeType)

  if (safeMime === PDF_MIME || isPdfName(safeName)) {
    return parsePdfText(fileBuffer)
  }
  if (safeMime === DOCX_MIME || isDocxName(safeName)) {
    const htmlParsed = await mammoth.convertToHtml({ buffer: fileBuffer })
    const fromHtml = htmlToMarkdownish(htmlParsed.value || '')
    const rawParsed = await mammoth.extractRawText({ buffer: fileBuffer })
    const fromRaw = postProcessExtractedText(rawParsed.value || '')
    return extractedQualityScore(fromHtml) >= extractedQualityScore(fromRaw) ? fromHtml : fromRaw
  }
  if (safeMime === TEXT_MIME || safeMime === MARKDOWN_MIME || isTxtName(safeName) || isMdName(safeName)) {
    return postProcessExtractedText(fileBuffer.toString('utf8'))
  }
  return ''
}
