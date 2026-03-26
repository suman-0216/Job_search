import { useState, useEffect, useRef, useMemo } from 'react'

type InlineToken = { type: 'text'; text: string } | { type: 'link'; text: string; url: string } | { type: 'bold'; text: string }
type PaneKey = 'inputs' | 'output'
type AutosaveState = 'idle' | 'saving' | 'saved' | 'error'
type ResumeFont = 'Arial' | 'Times New Roman' | 'Calibri' | 'Roboto' | 'Garamond'

const RESUME_STUDIO_DRAFT_KEY = 'resume_studio_draft_v1'
const RESUME_FONT_OPTIONS: ResumeFont[] = ['Arial', 'Times New Roman', 'Calibri', 'Roboto', 'Garamond']
const DEFAULT_DOWNLOAD_NAME = 'tailored_resume'

const toDownloadStem = (value: string): string => {
  const stem = String(value || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return stem || DEFAULT_DOWNLOAD_NAME
}

const DEFAULT_ATS_PROMPT = `You are a senior recruiter and ATS expert.
Rewrite my resume to match the given job description so it passes ATS screening, uses the same keywords, skills, and role language, and highlights real impact with metrics.
Keep it truthful to my experience and keep it clean, simple, and recruiter-friendly.
Optimize the summary and skills (ATS keywords first).
Write experience bullets as: action + skill + impact.
Use strict heading hierarchy:
- # FULL NAME (name only)
- ## SUMMARY / WORK EXPERIENCE / TECHNICAL SKILLS / PROJECT EXPERIENCE / EDUCATION
- ### Job titles and project titles only
- Normal text for everything else
Do not use markdown bold markers ("**").
In TECHNICAL SKILLS, do not use bullets or numbered lists. Keep plain text lines only.
Under each PROJECT EXPERIENCE entry, include at least 2 bullet points.
Preserve list style from the source resume:
- keep numbered lists as numbered lists
- keep bullet lists as bullet lists
Do not add fake experience.`
type ParsedLine =
  | { type: 'heading'; level: 1 | 2 | 3; tokens: InlineToken[] }
  | { type: 'bullet'; marker: 'unordered' | 'ordered'; number?: string; tokens: InlineToken[] }
  | { type: 'paragraph'; tokens: InlineToken[] }
  | { type: 'blank' }

const toStringValue = (value: unknown): string => (typeof value === 'string' ? value : '')
const isResumeFont = (value: unknown): value is ResumeFont => typeof value === 'string' && RESUME_FONT_OPTIONS.includes(value as ResumeFont)

const parseBold = (value: string): InlineToken[] => {
  const text = value || ''
  const regex = /\*\*([^*]+)\*\*/g
  const tokens: InlineToken[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) tokens.push({ type: 'text', text: text.slice(last, match.index) })
    tokens.push({ type: 'bold', text: match[1] })
    last = match.index + match[0].length
  }
  if (last < text.length) tokens.push({ type: 'text', text: text.slice(last) })
  if (tokens.length === 0) tokens.push({ type: 'text', text })
  return tokens
}

const parseInline = (input: string): InlineToken[] => {
  const text = input || ''
  const regex = /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)]+)\)/g
  const preTokens: InlineToken[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) preTokens.push({ type: 'text', text: text.slice(last, match.index) })
    preTokens.push({ type: 'link', text: match[1], url: match[2] })
    last = match.index + match[0].length
  }
  if (last < text.length) preTokens.push({ type: 'text', text: text.slice(last) })

  const tokens: InlineToken[] = []
  for (const token of preTokens) {
    if (token.type !== 'text') {
      tokens.push(token)
      continue
    }
    const rawUrlRegex = /(https?:\/\/[^\s]+)/g
    let cursor = 0
    let urlMatch: RegExpExecArray | null
    while ((urlMatch = rawUrlRegex.exec(token.text)) !== null) {
      if (urlMatch.index > cursor) tokens.push(...parseBold(token.text.slice(cursor, urlMatch.index)))
      const rawUrl = urlMatch[1]
      const cleanUrl = rawUrl.replace(/[),.;!?]+$/, '')
      const trailingText = rawUrl.slice(cleanUrl.length)
      tokens.push({ type: 'link', text: cleanUrl, url: cleanUrl })
      if (trailingText) tokens.push({ type: 'text', text: trailingText })
      cursor = urlMatch.index + rawUrl.length
    }
    if (cursor < token.text.length) tokens.push(...parseBold(token.text.slice(cursor)))
  }
  if (tokens.length === 0) tokens.push({ type: 'text', text })
  return tokens
}

const parseMarkdown = (markdown: string): ParsedLine[] =>
  String(markdown || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((rawLine) => {
      const line = rawLine.trim()
      if (!line) return { type: 'blank' } as ParsedLine
      const h3 = line.match(/^###\s+(.+)/)
      if (h3) return { type: 'heading', level: 3, tokens: parseInline(h3[1]) } as ParsedLine
      const h2 = line.match(/^##\s+(.+)/)
      if (h2) return { type: 'heading', level: 2, tokens: parseInline(h2[1]) } as ParsedLine
      const h1 = line.match(/^#\s+(.+)/)
      if (h1) return { type: 'heading', level: 1, tokens: parseInline(h1[1]) } as ParsedLine
      const ordered = line.match(/^(\d+)[.)]\s+(.+)/)
      if (ordered) return { type: 'bullet', marker: 'ordered', number: ordered[1], tokens: parseInline(ordered[2]) } as ParsedLine
      const bullet = line.match(/^[-*\u2022]\s+(.+)/)
      if (bullet) return { type: 'bullet', marker: 'unordered', tokens: parseInline(bullet[1]) } as ParsedLine
      return { type: 'paragraph', tokens: parseInline(line) } as ParsedLine
    })

const isDateOnlyLine = (value: string): boolean => {
  const line = value.trim()
  if (!line) return false
  return /^(?:[A-Za-z]{3,9}\s+\d{4})(?:\s*-\s*(?:[A-Za-z]{3,9}\s+\d{4}|Present))?$/i.test(line)
}

const normalizeGithubTitleDateLayout = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const output: string[] = []

  const parseTitleAndLink = (
    rawLine: string,
  ): { indent: string; title: string; link: string; trailingDate: string; raw: string } | null => {
    const line = rawLine || ''
    const indentMatch = line.match(/^(\s*)/)
    const indent = indentMatch?.[1] || ''
    const content = line.trim()

    const alreadyLinked = content.match(
      /^(?:\*\*)?\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(?:\*\*)?\s*\|\s*\[(?:GitHub|Repo|Code)\]\((https?:\/\/[^)\s]+)\)\s*(?:\|\s*(.+))?$/i,
    )
    if (alreadyLinked) {
      const title = (alreadyLinked[1] || '').trim()
      const titleLink = (alreadyLinked[2] || '').trim()
      const trailingDate = (alreadyLinked[4] || '').trim()
      if (!title || !titleLink) return null
      return { indent, title, link: titleLink, trailingDate, raw: rawLine }
    }

    const separateGithub = content.match(
      /^(?:\*\*)?(.+?)(?:\*\*)?\s*\|\s*\[(?:GitHub|Repo|Code)\]\((https?:\/\/[^)\s]+)\)\s*(?:\|\s*(.+))?$/i,
    )
    if (separateGithub) {
      const title = (separateGithub[1] || '').trim().replace(/^\[([^\]]+)\]\(https?:\/\/[^)\s]+\)$/i, '$1')
      const link = (separateGithub[2] || '').trim()
      const trailingDate = (separateGithub[3] || '').trim()
      if (!title || !link) return null
      return { indent, title, link, trailingDate, raw: rawLine }
    }

    return null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index]
    const parsed = parseTitleAndLink(current)
    if (!parsed) {
      output.push(current)
      continue
    }

    const next = lines[index + 1] || ''
    const dateFromNext = isDateOnlyLine(next) ? next.trim() : ''
    const trailingDate = isDateOnlyLine(parsed.trailingDate) ? parsed.trailingDate : ''
    const date = trailingDate || dateFromNext
    if (!date) {
      output.push(parsed.raw)
      continue
    }
    output.push(`${parsed.indent}[${parsed.title}](${parsed.link}) | ${date}`)
    if (dateFromNext) index += 1
  }

  return output.join('\n')
}

const normalizeLooseTitle = (value: string): string =>
  String(value || '')
    .replace(/^###\s+/, '')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, '$1')
    .split('|')[0]
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const extractProjectLinkMapFromSource = (resumeSource: string): Map<string, { title: string; url: string; date: string }> => {
  const lines = String(resumeSource || '').replace(/\r/g, '\n').split('\n')
  const map = new Map<string, { title: string; url: string; date: string }>()
  let currentSection = ''
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (isLikelySectionHeading(line)) {
      currentSection = normalizeSectionKey(line)
      continue
    }
    if (currentSection !== 'projects') continue
    const linked = line.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*(?:\|\s*(.+))?$/i)
    if (!linked) continue
    const title = String(linked[1] || '').trim()
    const url = String(linked[2] || '').trim()
    const date = String(linked[3] || '').trim()
    if (!title || !url) continue
    const key = normalizeLooseTitle(title)
    if (!key) continue
    map.set(key, { title, url, date })
  }
  return map
}

const preserveProjectHyperlinksFromSource = (markdown: string, resumeSource: string): string => {
  const sourceLinks = extractProjectLinkMapFromSource(resumeSource)
  if (!sourceLinks.size) return markdown

  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  let currentSection = ''
  const output = lines.map((raw) => {
    const indent = raw.match(/^\s*/)?.[0] || ''
    const line = raw.trim()
    if (/^##\s+/.test(line)) {
      currentSection = normalizeSectionKey(line)
      return raw
    }
    if (currentSection !== 'projects') return raw
    if (!line) return raw
    if (/^(\s*)([-*]|\d+[.)])\s+/.test(line)) return raw

    const titleText = line.replace(/^###\s+/, '').trim()
    const linkedMatch = titleText.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*(?:\|\s*(.+))?$/i)
    const parts = titleText.split('|').map((part) => part.trim()).filter(Boolean)
    const titleOnly = linkedMatch ? String(linkedMatch[1] || '').trim() : parts[0] || titleText
    const key = normalizeLooseTitle(titleOnly)
    const sourceLink = sourceLinks.get(key)
    if (!sourceLink) return raw
    const date = linkedMatch ? String(linkedMatch[3] || '').trim() || sourceLink.date : parts.slice(1).join(' | ') || sourceLink.date
    const linkedTitle = `[${sourceLink.title}](${sourceLink.url})`
    return `${indent}### ${date ? `${linkedTitle} | ${date}` : linkedTitle}`
  })
  return output.join('\n')
}

const toTitleCaseToken = (token: string): string => {
  const raw = String(token || '')
  if (!raw) return raw
  const lower = raw.toLowerCase()
  const alwaysUpper = new Set([
    'ai',
    'ml',
    'nlp',
    'llm',
    'api',
    'sdk',
    'aws',
    'gcp',
    'sql',
    'ui',
    'qa',
    'ocr',
    'rag',
    'mcp',
    'a2a',
    'gpa',
    'usa',
    'ms',
    'bs',
    'phd',
    'mba',
    'm.s.',
    'b.s.',
    'ph.d.',
  ])
  if (alwaysUpper.has(lower)) return lower.toUpperCase()
  if (/^[A-Z0-9+/.-]{2,}$/.test(raw) && /[0-9]/.test(raw)) return raw
  if (/^[A-Z]{2,}$/.test(raw)) return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
  return raw
}

const normalizeRoleAndProjectTitleCasing = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  let currentSection = ''
  const toNaturalCase = (text: string): string =>
    text.replace(/[A-Za-z][A-Za-z0-9/+.-]*/g, (word) => toTitleCaseToken(word))

  const output = lines.map((raw) => {
    const line = raw.trim()
    if (/^##\s+/.test(line)) {
      currentSection = normalizeSectionKey(line)
      return raw
    }
    if (currentSection !== 'experience' && currentSection !== 'projects') return raw
    if (!/^###\s+/.test(line)) return raw
    const body = line.replace(/^###\s+/, '')
    const letters = body.replace(/[^A-Za-z]/g, '')
    if (!letters) return raw
    const upperCount = letters.split('').filter((ch) => ch === ch.toUpperCase()).length
    const ratio = upperCount / letters.length
    if (ratio < 0.7) return raw
    return `### ${toNaturalCase(body)}`
  })
  return output.join('\n')
}

const normalizeEducationLineCasing = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  let currentSection = ''
  const toNaturalCase = (text: string): string => text.replace(/[A-Za-z][A-Za-z0-9/+.-]*/g, (word) => toTitleCaseToken(word))
  const output = lines.map((raw) => {
    const line = raw.trim()
    if (/^##\s+/.test(line)) {
      currentSection = normalizeSectionKey(line)
      return raw
    }
    if (currentSection !== 'education') return raw
    if (!line || /^###\s+/.test(line)) return raw
    if (/^(\s*)([-*]|\d+[.)])\s+/.test(line)) return raw
    const letters = line.replace(/[^A-Za-z]/g, '')
    if (!letters) return raw
    const upperCount = letters.split('').filter((ch) => ch === ch.toUpperCase()).length
    const ratio = upperCount / letters.length
    if (ratio < 0.65) return raw
    return toNaturalCase(raw)
  })
  return output.join('\n')
}

const extractProfileUrls = (text: string): { linkedin: string; github: string; portfolio: string } => {
  const urls = Array.from(String(text || '').matchAll(/https?:\/\/[^\s)\]]+/gi)).map((match) => match[0].replace(/[),.;!?]+$/, ''))
  let linkedin = ''
  let github = ''
  let portfolio = ''
  for (const url of urls) {
    const lower = url.toLowerCase()
    if (!linkedin && lower.includes('linkedin.com/')) {
      linkedin = url
      continue
    }
    if (!github && lower.includes('github.com/')) {
      github = url
      continue
    }
    if (!portfolio && !lower.includes('linkedin.com/') && !lower.includes('github.com/')) {
      portfolio = url
    }
  }
  return { linkedin, github, portfolio }
}

const normalizeProfileLabeledLinks = (markdown: string, resumeSource: string): string => {
  const profileUrls = extractProfileUrls(resumeSource || markdown)
  return String(markdown || '').replace(/\[(linkedin|github|portfolio)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, (full, rawLabel: string) => {
    const label = String(rawLabel || '').toLowerCase()
    if (label === 'linkedin' && profileUrls.linkedin) return `[LinkedIn](${profileUrls.linkedin})`
    if (label === 'github' && profileUrls.github) return `[GitHub](${profileUrls.github})`
    if (label === 'portfolio' && profileUrls.portfolio) return `[Portfolio](${profileUrls.portfolio})`
    return full
  })
}

const isLikelyLocationToken = (value: string): boolean => {
  const token = String(value || '').trim()
  if (!token || token.length > 64) return false
  if (/@|https?:\/\/|www\./i.test(token)) return false
  if (/\b(linkedin|github|portfolio)\b/i.test(token)) return false
  if (/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(token)) return false
  if (/^\d+$/.test(token)) return false
  if (/,/.test(token)) return true
  if (/^[A-Za-z.\s'-]+\s+[A-Z]{2}$/.test(token)) return true
  if (/\b(remote|united states|usa|india|canada|uk|europe)\b/i.test(token)) return true
  return false
}

const extractLocationFromContactLikeLine = (line: string): string => {
  const normalized = String(line || '')
    .replace(/\*\*/g, '')
    .replace(/\[(linkedin|github|portfolio)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''
  const parts = normalized
    .split(/[|•]/)
    .map((part) => part.trim())
    .filter(Boolean)
  const locationPart = parts.find((part) => isLikelyLocationToken(part))
  return locationPart || ''
}

const extractHeaderLocation = (contactLine: string, resumeSource: string): string => {
  const fromContact = extractLocationFromContactLikeLine(contactLine)
  if (fromContact) return fromContact
  const sourceLines = String(resumeSource || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const candidateLines = sourceLines.slice(1, 4)
  for (const line of candidateLines) {
    const found = extractLocationFromContactLikeLine(line)
    if (found) return found
  }
  return ''
}

const normalizeHeaderContactLinks = (markdown: string, resumeSource: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  if (!lines.length) return markdown

  const profileUrls = extractProfileUrls(resumeSource || markdown)

  const nonEmptyIndexes = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((item) => item.line.length > 0)
    .map((item) => item.index)

  if (nonEmptyIndexes.length < 2) return markdown

  const contactIndex = nonEmptyIndexes[1]
  const contactLineRaw = lines[contactIndex]
  const contactLine = contactLineRaw.replace(/\*\*/g, '')
  if (!/[|@]|linkedin|github|portfolio/i.test(contactLine)) return markdown

  const locationValue = extractHeaderLocation(contactLine, resumeSource)
  const emailMatch = contactLine.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  const phoneMatch = contactLine.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)

  const existingLabeledLinks = Array.from(contactLine.matchAll(/\[(linkedin|github|portfolio)\]\((https?:\/\/[^)\s]+)\)/gi))
  for (const match of existingLabeledLinks) {
    const label = (match[1] || '').toLowerCase()
    const url = (match[2] || '').trim()
    if (label === 'linkedin' && !profileUrls.linkedin) profileUrls.linkedin = url
    if (label === 'github' && !profileUrls.github) profileUrls.github = url
    if (label === 'portfolio' && !profileUrls.portfolio) profileUrls.portfolio = url
  }

  const parts: string[] = []
  if (locationValue) parts.push(locationValue)
  if (phoneMatch) parts.push(phoneMatch[0])
  if (emailMatch) parts.push(emailMatch[0])
  if (profileUrls.linkedin) parts.push(`[LinkedIn](${profileUrls.linkedin})`)
  if (profileUrls.github) parts.push(`[GitHub](${profileUrls.github})`)
  if (profileUrls.portfolio) parts.push(`[Portfolio](${profileUrls.portfolio})`)

  if (parts.length === 0) return markdown
  lines[contactIndex] = parts.join(' | ')
  return lines.join('\n')
}

const normalizeBulletMarkers = (markdown: string): string =>
  String(markdown || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => {
      const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/)
      if (ordered) return `${ordered[1]}${ordered[2]}. ${ordered[3]}`
      const match = line.match(/^(\s*)[*\-•]\s+(.+)$/)
      return match ? `${match[1]}- ${match[2]}` : line
    })
    .join('\n')

const stripBoldAroundLinks = (markdown: string): string =>
  String(markdown || '').replace(/\*\*\s*(\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)]+\))\s*\*\*/gi, '$1')

const stripMarkdownBoldMarkers = (markdown: string): string => String(markdown || '').replace(/\*\*/g, '')

const SECTION_HEADING_MAP: Record<string, string> = {
  summary: 'SUMMARY',
  experience: 'WORK EXPERIENCE',
  skills: 'TECHNICAL SKILLS',
  projects: 'PROJECT EXPERIENCE',
  education: 'EDUCATION',
  certifications: 'CERTIFICATIONS',
}
const KNOWN_SECTION_KEYS = new Set(Object.keys(SECTION_HEADING_MAP))

const normalizeHeadingText = (value: string): string =>
  String(value || '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim()

const looksLikeRoleOrProjectTitle = (line: string): boolean => {
  const text = normalizeHeadingText(line)
  if (!text) return false
  if (text.length > 180) return false
  if (/^[-*]\s+/.test(text)) return false
  const hasDate = /\b(19|20)\d{2}\b/.test(text) || /\bpresent\b/i.test(text)
  const hasPipe = text.includes('|')
  const looksLikeTitle = /(engineer|developer|manager|architect|scientist|analyst|specialist|intern|lead|director|consultant|project)/i.test(text)
  return hasPipe || hasDate || looksLikeTitle
}

const enforceResumeHeadingHierarchy = (markdown: string, resumeSource: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const nonEmpty = lines.findIndex((line) => line.trim().length > 0)
  if (nonEmpty < 0) return markdown

  const generatedFirstLine = normalizeHeadingText(lines[nonEmpty])
  const generatedFirstKey = normalizeSectionKey(generatedFirstLine)
  const resumeFirstNonEmpty = String(resumeSource || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  const resumeFirstLine = normalizeHeadingText(resumeFirstNonEmpty || '')
  const sourceName =
    generatedFirstKey in SECTION_HEADING_MAP || isLikelySectionHeading(generatedFirstLine) ? resumeFirstLine || generatedFirstLine : generatedFirstLine
  const normalizedName = sourceName.replace(/\s*\|.*$/, '').trim()
  const output: string[] = []
  output.push(`# ${normalizedName ? normalizedName.toUpperCase() : 'CANDIDATE NAME'}`)

  let currentSectionKey = ''
  for (let index = nonEmpty + 1; index < lines.length; index += 1) {
    const raw = lines[index]
    const trimmed = raw.trim()
    if (!trimmed) {
      output.push('')
      continue
    }

    const headingCandidate = normalizeHeadingText(trimmed)
    const headingKey = normalizeSectionKey(headingCandidate)
    const isHeading = /^#{1,6}\s+/.test(trimmed) || isLikelySectionHeading(trimmed)
    if (normalizedName && headingCandidate.toUpperCase() === normalizedName.toUpperCase()) {
      continue
    }
    if (isHeading && headingKey && KNOWN_SECTION_KEYS.has(headingKey)) {
      const sectionTitle = SECTION_HEADING_MAP[headingKey] || headingCandidate.toUpperCase()
      output.push(`## ${sectionTitle}`)
      currentSectionKey = headingKey
      continue
    }

    const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/)
    if (ordered) {
      output.push(`${ordered[1]}. ${normalizeHeadingText(ordered[2])}`)
      continue
    }

    const unordered = trimmed.match(/^[-*\u2022]\s+(.+)$/)
    if (unordered) {
      output.push(`- ${normalizeHeadingText(unordered[1])}`)
      continue
    }

    const plain = normalizeHeadingText(trimmed)
    if ((currentSectionKey === 'experience' || currentSectionKey === 'projects') && looksLikeRoleOrProjectTitle(plain)) {
      output.push(`### ${plain}`)
      continue
    }

    output.push(plain)
  }

  return output.join('\n')
}

const normalizeSectionKey = (value: string): string => {
  const cleaned = normalizeHeadingText(
    String(value || '')
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*]\s+/, ''),
  )
    .replace(/:$/, '')
    .replace(/[:\s]+$/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  if (/(professional summary|summary|profile|objective)/.test(cleaned)) return 'summary'
  if (/(project experience|projects|project)/.test(cleaned)) return 'projects'
  if (/(work experience|professional experience|experience|employment)/.test(cleaned)) return 'experience'
  if (/(technical skills|skills|core skills|competencies)/.test(cleaned)) return 'skills'
  if (/(education|academic)/.test(cleaned)) return 'education'
  if (/(certifications|licenses|certification)/.test(cleaned)) return 'certifications'
  return cleaned
}

const isLikelySectionHeading = (line: string): boolean => {
  const raw = String(line || '').trim()
  if (!raw) return false
  const hasMarkdownHeading = /^#{1,6}\s+\S+/.test(raw)
  const hasBoldMarkerHeading = /^\*\*[^*]+\*\*$/.test(raw)
  const isAllCapsHeading = /[A-Z]/.test(raw) && raw === raw.toUpperCase()

  const normalized = normalizeHeadingText(raw)
    .replace(/:$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return false

  const key = normalizeSectionKey(normalized)
  if (KNOWN_SECTION_KEYS.has(key)) return hasMarkdownHeading || hasBoldMarkerHeading || isAllCapsHeading
  if (normalized.length > 72) return false
  if (!/^[A-Za-z][A-Za-z0-9 &/()+,.-]{2,}$/.test(normalized)) return false
  return /(summary|experience|project|skill|education|certification)/i.test(normalized)
}

const extractSectionOrderFromResumeText = (resumeText: string): string[] => {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const raw of String(resumeText || '').replace(/\r/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!isLikelySectionHeading(line)) continue
    const key = normalizeSectionKey(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    ordered.push(key)
  }
  return ordered
}

const extractKnownSectionBlocksFromSource = (resumeSource: string): Map<string, string[]> => {
  const lines = String(resumeSource || '').replace(/\r/g, '\n').split('\n')
  const blocks = new Map<string, string[]>()
  let index = 0
  while (index < lines.length) {
    const current = lines[index]?.trim() || ''
    if (!current || !isLikelySectionHeading(current)) {
      index += 1
      continue
    }
    const key = normalizeSectionKey(current)
    if (!KNOWN_SECTION_KEYS.has(key)) {
      index += 1
      continue
    }

    const content: string[] = []
    let cursor = index + 1
    while (cursor < lines.length) {
      const next = lines[cursor]?.trim() || ''
      if (next && isLikelySectionHeading(next)) break
      if (next) content.push(next)
      cursor += 1
    }
    if (content.length > 0) {
      blocks.set(key, [`## ${SECTION_HEADING_MAP[key]}`, ...content])
    }
    index = cursor
  }
  return blocks
}

const ensureSourceSectionsPresent = (generated: string, resumeSource: string): string => {
  const lines = String(generated || '').replace(/\r/g, '\n').split('\n')
  const generatedKeys = new Set(
    lines
      .map((line) => line.trim())
      .filter((line) => /^##\s+/.test(line))
      .map((line) => normalizeSectionKey(line))
      .filter((key) => KNOWN_SECTION_KEYS.has(key)),
  )
  const sourceBlocks = extractKnownSectionBlocksFromSource(resumeSource)
  if (!sourceBlocks.size) return generated

  const desiredOrder = extractSectionOrderFromResumeText(resumeSource).filter((key) => KNOWN_SECTION_KEYS.has(key))
  const output = [...lines]
  let appended = false

  for (const key of desiredOrder) {
    if (generatedKeys.has(key)) continue
    const block = sourceBlocks.get(key)
    if (!block || block.length < 2) continue
    if (output.length > 0 && output[output.length - 1].trim()) output.push('')
    output.push(...block)
    appended = true
  }

  return appended ? output.join('\n') : generated
}

const getKnownSectionBlocks = (markdown: string): Array<{ key: string; start: number; end: number; lines: string[] }> => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const headingIndexes = lines
    .map((line, index) => ({ index, line: line.trim() }))
    .filter((item) => /^##\s+/.test(item.line) && KNOWN_SECTION_KEYS.has(normalizeSectionKey(item.line)))
    .map((item) => item.index)

  return headingIndexes.map((start, idx) => {
    const end = idx + 1 < headingIndexes.length ? headingIndexes[idx + 1] : lines.length
    const blockLines = lines.slice(start, end)
    return {
      key: normalizeSectionKey(blockLines[0] || ''),
      start,
      end,
      lines: blockLines,
    }
  })
}

const ensureProjectsSectionFromSource = (generated: string, resumeSource: string): string => {
  const sourceBlock = extractKnownSectionBlocksFromSource(resumeSource).get('projects')
  if (!sourceBlock || sourceBlock.length < 2) return generated

  const lines = String(generated || '').replace(/\r/g, '\n').split('\n')
  const blocks = getKnownSectionBlocks(generated)
  const projectBlocks = blocks.filter((block) => block.key === 'projects')

  if (!projectBlocks.length) {
    const output = [...lines]
    if (output.length > 0 && output[output.length - 1].trim()) output.push('')
    output.push(...sourceBlock)
    return output.join('\n')
  }

  // Keep best existing project block only if it has meaningful content; otherwise replace.
  let bestBlock = projectBlocks[0]
  let bestScore = -1
  for (const block of projectBlocks) {
    const score = block.lines
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ').length
    if (score > bestScore) {
      bestScore = score
      bestBlock = block
    }
  }

  const existingContentLines = bestBlock.lines
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
  const hasTitleLikeContent = existingContentLines.some((line) => /^###\s+/.test(line) || /^\[.+\]\(https?:\/\/[^)\s]+\)\s*\|/.test(line))
  const hasEnoughBullets = existingContentLines.filter((line) => /^[-*]\s+/.test(line)).length >= 2
  if (hasTitleLikeContent && hasEnoughBullets) return generated

  const replaced = [...lines.slice(0, bestBlock.start), ...sourceBlock, ...lines.slice(bestBlock.end)]
  return replaced.join('\n')
}

const reorderGeneratedSectionsToSourceOrder = (generated: string, resumeSource: string): string => {
  const desiredOrderRaw = extractSectionOrderFromResumeText(resumeSource)
  const desiredOrder = desiredOrderRaw.filter((key) => KNOWN_SECTION_KEYS.has(key))
  const fallbackOrder = ['summary', 'experience', 'projects', 'skills', 'education', 'certifications']
  const finalDesiredOrder = desiredOrder.length ? desiredOrder : fallbackOrder
  const lines = String(generated || '').replace(/\r/g, '\n').split('\n')
  const sectionHeadingIndexes = lines
    .map((line, index) => ({ index, line: line.trim() }))
    .filter((item) => /^#{1,6}\s+\S+/.test(item.line) && KNOWN_SECTION_KEYS.has(normalizeSectionKey(item.line)))
    .map((item) => item.index)

  if (!sectionHeadingIndexes.length) return generated

  const prelude = lines.slice(0, sectionHeadingIndexes[0])
  const blocks = sectionHeadingIndexes.map((startIndex, idx) => {
    const endIndex = idx + 1 < sectionHeadingIndexes.length ? sectionHeadingIndexes[idx + 1] : lines.length
    const heading = lines[startIndex] || ''
    return {
      key: normalizeSectionKey(heading),
      lines: lines.slice(startIndex, endIndex),
    }
  })

  const used = new Set<number>()
  const reordered: typeof blocks = []
  for (const key of finalDesiredOrder) {
    const blockIndex = blocks.findIndex((block, idx) => !used.has(idx) && block.key === key)
    if (blockIndex >= 0) {
      used.add(blockIndex)
      reordered.push(blocks[blockIndex])
    }
  }
  const emittedKnown = new Set(reordered.map((block) => block.key).filter((key) => KNOWN_SECTION_KEYS.has(key)))
  blocks.forEach((block, idx) => {
    if (used.has(idx)) return
    if (KNOWN_SECTION_KEYS.has(block.key) && emittedKnown.has(block.key)) return
    reordered.push(block)
    if (KNOWN_SECTION_KEYS.has(block.key)) emittedKnown.add(block.key)
  })

  return [...prelude, ...reordered.flatMap((block) => block.lines)].join('\n')
}

const removeDuplicateKnownSectionBlocks = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const headingIndexes = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((item) => /^##\s+/.test(item.line) && KNOWN_SECTION_KEYS.has(normalizeSectionKey(item.line)))
    .map((item) => item.index)

  if (!headingIndexes.length) return markdown

  const firstHeading = headingIndexes[0]
  const prelude = [...lines.slice(0, firstHeading)]
  const blocks = headingIndexes.map((start, index) => {
    const end = index + 1 < headingIndexes.length ? headingIndexes[index + 1] : lines.length
    const blockLines = lines.slice(start, end)
    const key = normalizeSectionKey(blockLines[0] || '')
    const nonEmptyContent = blockLines
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
    const score = nonEmptyContent.join(' ').length + nonEmptyContent.length * 25
    return { key, lines: blockLines, score }
  })

  const bestBlockByKey = new Map<string, { key: string; lines: string[]; score: number }>()
  for (const block of blocks) {
    if (!block.key) continue
    const current = bestBlockByKey.get(block.key)
    if (!current || block.score > current.score) bestBlockByKey.set(block.key, block)
  }

  const output = [...prelude]
  const emittedKnownKeys = new Set<string>()
  for (const block of blocks) {
    if (!block.key) {
      output.push(...block.lines)
      continue
    }
    if (!KNOWN_SECTION_KEYS.has(block.key)) {
      output.push(...block.lines)
      continue
    }
    if (emittedKnownKeys.has(block.key)) continue
    emittedKnownKeys.add(block.key)
    const best = bestBlockByKey.get(block.key) || block
    output.push(...best.lines)
  }

  return output.join('\n')
}

const lineSignature = (line: string): string =>
  String(line || '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(\s*)([-*]|\d+[.)])\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const removeDuplicateLines = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const output: string[] = []
  let previousNonBlankSignature = ''

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed) {
      output.push('')
      continue
    }
    const signature = lineSignature(trimmed)
    if (signature && signature === previousNonBlankSignature) continue
    output.push(raw)
    previousNonBlankSignature = signature
  }

  return output.join('\n')
}

const collapseDoubleBlankLines = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const output: string[] = []
  let previousWasBlank = false
  for (const line of lines) {
    const isBlank = !line.trim()
    if (isBlank && previousWasBlank) continue
    output.push(line)
    previousWasBlank = isBlank
  }
  return output.join('\n').trim()
}

const normalizeDateRangeCasing = (markdown: string): string =>
  String(markdown || '').replace(DATE_RANGE_REGEX, (matched) =>
    matched.replace(/\b([A-Za-z]+|Present)\b/g, (word) => {
      const lower = word.toLowerCase()
      if (lower === 'present') return 'Present'
      return lower.slice(0, 1).toUpperCase() + lower.slice(1)
    }),
  )

const removeSkillsBullets = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  let currentSectionKey = ''
  const output = lines.map((line) => {
    const trimmed = line.trim()
    if (/^#{1,6}\s+/.test(trimmed)) {
      currentSectionKey = normalizeSectionKey(trimmed)
      return line
    }
    if (currentSectionKey !== 'skills') return line
    const ordered = line.match(/^(\s*)\d+[.)]\s+(.+)$/)
    if (ordered) return `${ordered[1]}${ordered[2]}`
    const unordered = line.match(/^(\s*)[-*\u2022]\s+(.+)$/)
    if (unordered) return `${unordered[1]}${unordered[2]}`
    return line
  })
  return output.join('\n')
}

const extractEducationDegreeLine = (resumeSource: string): string => {
  const lines = String(resumeSource || '').replace(/\r/g, '\n').split('\n')
  let inEducation = false
  const candidates: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (isLikelySectionHeading(line)) {
      const key = normalizeSectionKey(line)
      if (key === 'education') {
        inEducation = true
        continue
      }
      if (inEducation) break
      continue
    }
    if (!inEducation) continue
    if (/^(\s*)([-*]|\d+[.)])\s+/.test(line)) continue
    // Skip obvious contact/link lines.
    if (/@|linkedin|github|portfolio|https?:\/\/|www\./i.test(line)) continue
    if (/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(line)) continue
    candidates.push(normalizeHeadingText(line))
  }
  if (!candidates.length) return ''

  const scoreCandidate = (value: string): number => {
    const text = String(value || '').trim()
    if (!text) return -9999
    let score = text.length
    if (text.includes('|')) score += 30
    if (/\b(19|20)\d{2}\b|\bpresent\b/i.test(text)) score += 20
    if (/\b(gpa|b\.?s\.?|m\.?s\.?|bachelor|master|ph\.?d|mba|associate|diploma|b\.tech|m\.tech)\b/i.test(text)) score += 40
    if (/\b(university|college|school|institute)\b/i.test(text)) score -= 8
    return score
  }

  return [...candidates].sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0] || ''
}

const ensureEducationDegreeFromSource = (markdown: string, resumeSource: string): string => {
  const sourceDegree = extractEducationDegreeLine(resumeSource)
  if (!sourceDegree) return markdown
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const educationIndex = lines.findIndex((line) => /^##\s+/.test(line.trim()) && normalizeSectionKey(line) === 'education')
  if (educationIndex < 0) return markdown

  let blockEnd = educationIndex + 1
  while (blockEnd < lines.length && !/^##\s+/.test(lines[blockEnd].trim())) blockEnd += 1

  const hasDegreeLine = lines
    .slice(educationIndex + 1, blockEnd)
    .map((line) => normalizeHeadingText(line).toLowerCase())
    .includes(sourceDegree.toLowerCase())
  if (hasDegreeLine) return markdown

  let insertAt = educationIndex + 1
  while (insertAt < blockEnd && !lines[insertAt].trim()) insertAt += 1
  lines.splice(insertAt, 0, sourceDegree)
  return lines.join('\n')
}

const dedupeEducationLines = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const educationIndex = lines.findIndex((line) => /^##\s+/.test(line.trim()) && normalizeSectionKey(line) === 'education')
  if (educationIndex < 0) return markdown

  let blockEnd = educationIndex + 1
  while (blockEnd < lines.length && !/^##\s+/.test(lines[blockEnd].trim())) blockEnd += 1

  type Candidate = { index: number; key: string; score: number }
  const bestByKey = new Map<string, Candidate>()
  const toRemove = new Set<number>()

  const keyForLine = (value: string): string => {
    const normalized = normalizeHeadingText(value)
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    // Treat "School" and "School | May 2025" as same key.
    return normalized.split('|')[0].trim().toLowerCase()
  }

  const scoreLine = (value: string): number => {
    const text = normalizeHeadingText(value)
    return text.length + (text.includes('|') ? 30 : 0) + (/\b(19|20)\d{2}\b/.test(text) ? 20 : 0)
  }

  for (let i = educationIndex + 1; i < blockEnd; i += 1) {
    const t = lines[i].trim()
    if (!t) continue
    if (/^(\s*)([-*]|\d+[.)])\s+/.test(t)) continue
    if (/^###\s+/.test(t)) continue
    const key = keyForLine(t)
    if (!key) continue
    const candidate: Candidate = { index: i, key, score: scoreLine(t) }
    const existing = bestByKey.get(key)
    if (!existing) {
      bestByKey.set(key, candidate)
      continue
    }
    if (candidate.score > existing.score) {
      toRemove.add(existing.index)
      bestByKey.set(key, candidate)
    } else {
      toRemove.add(candidate.index)
    }
  }

  if (!toRemove.size) return markdown
  const output = lines.filter((_, index) => !toRemove.has(index))
  return output.join('\n')
}

const removeRedundantEducationMetaBullets = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const educationIndex = lines.findIndex((line) => /^##\s+/.test(line.trim()) && normalizeSectionKey(line) === 'education')
  if (educationIndex < 0) return markdown

  let blockEnd = educationIndex + 1
  while (blockEnd < lines.length && !/^##\s+/.test(lines[blockEnd].trim())) blockEnd += 1

  const plainEducationLines = lines
    .slice(educationIndex + 1, blockEnd)
    .map((line) => line.trim())
    .filter((line) => line && !/^(\s*)([-*]|\d+[.)])\s+/.test(line))

  const degreeLineAlreadyHasMeta = plainEducationLines.some((line) => /\bgpa\b/i.test(line) || /\b(19|20)\d{2}\b/.test(line))
  if (!degreeLineAlreadyHasMeta) return markdown

  const isRedundantMetaBullet = (value: string): boolean => {
    const line = String(value || '').trim()
    if (!/^(\s*)([-*]|\d+[.)])\s+/.test(line)) return false
    const body = line.replace(/^(\s*)([-*]|\d+[.)])\s+/, '').trim()
    if (/^(gpa|cgpa|grade|graduation|graduated|graduation date|date)\b/i.test(body)) return true
    if (/\bgpa\b/i.test(body)) return true
    if (/\b(19|20)\d{2}\b/.test(body) && /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(body)) return true
    return false
  }

  const output: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (index > educationIndex && index < blockEnd && isRedundantMetaBullet(lines[index])) continue
    output.push(lines[index])
  }
  return output.join('\n')
}

const extractEducationBlockFromSource = (resumeSource: string): string[] => {
  const lines = String(resumeSource || '').replace(/\r/g, '\n').split('\n')
  let inEducation = false
  const content: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (inEducation) content.push('')
      continue
    }
    if (isLikelySectionHeading(line)) {
      const key = normalizeSectionKey(line)
      if (key === 'education') {
        inEducation = true
        continue
      }
      if (inEducation) break
      continue
    }
    if (!inEducation) continue
    content.push(normalizeHeadingText(line))
  }
  return content.filter((line, index, arr) => !(line === '' && (index === 0 || index === arr.length - 1)))
}

const ensureEducationSectionFromSourceExact = (markdown: string, resumeSource: string): string => {
  const sourceContent = extractEducationBlockFromSource(resumeSource)
  if (!sourceContent.length) return markdown

  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const educationIndex = lines.findIndex((line) => /^##\s+/.test(line.trim()) && normalizeSectionKey(line) === 'education')

  if (educationIndex < 0) {
    const output = [...lines]
    if (output.length && output[output.length - 1].trim()) output.push('')
    output.push('## EDUCATION', ...sourceContent)
    return output.join('\n')
  }

  let blockEnd = educationIndex + 1
  while (blockEnd < lines.length && !/^##\s+/.test(lines[blockEnd].trim())) blockEnd += 1
  const output = [...lines.slice(0, educationIndex + 1), ...sourceContent, ...lines.slice(blockEnd)]
  return output.join('\n')
}

const ensureProjectMinimumBullets = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  let currentSectionKey = ''
  let index = 0

  const isHeading = (line: string): boolean => /^#{1,6}\s+/.test(line.trim())
  const isBullet = (line: string): boolean => /^(\s*)([-*]|\d+[.)])\s+/.test(line)
  const toBulletLine = (line: string): string => {
    const trimmed = line.trim()
    if (!trimmed) return line
    if (isBullet(trimmed)) return trimmed
    return `- ${trimmed}`
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed) {
      index += 1
      continue
    }

    if (/^##\s+/.test(trimmed)) {
      currentSectionKey = normalizeSectionKey(trimmed)
      index += 1
      continue
    }

    if (currentSectionKey !== 'projects' || !/^###\s+/.test(trimmed)) {
      index += 1
      continue
    }

    const blockStart = index + 1
    let blockEnd = blockStart
    while (blockEnd < lines.length) {
      const t = lines[blockEnd].trim()
      if (/^##\s+/.test(t) || /^###\s+/.test(t)) break
      blockEnd += 1
    }

    for (let i = blockStart; i < blockEnd; i += 1) {
      const t = lines[i].trim()
      if (!t) continue
      if (!isBullet(t) && !isHeading(t)) {
        lines[i] = toBulletLine(lines[i])
      }
    }

    const bulletIndexes: number[] = []
    for (let i = blockStart; i < blockEnd; i += 1) {
      if (isBullet(lines[i].trim())) bulletIndexes.push(i)
    }

    if (bulletIndexes.length === 1) {
      const firstIdx = bulletIndexes[0]
      const first = lines[firstIdx].replace(/^(\s*)([-*]|\d+[.)])\s+/, '').trim()
      const split = first.split(/\s+(?:and|while|plus)\s+/i)
      if (split.length >= 2) {
        const firstPart = split[0].trim()
        const secondPart = split.slice(1).join(' and ').trim()
        if (firstPart.length > 24 && secondPart.length > 24) {
          lines[firstIdx] = `- ${firstPart}`
          lines.splice(firstIdx + 1, 0, `- ${secondPart[0].toUpperCase()}${secondPart.slice(1)}`)
          blockEnd += 1
        }
      }
    }

    const bulletsAfter: number[] = []
    for (let i = blockStart; i < blockEnd; i += 1) {
      if (isBullet(lines[i].trim())) bulletsAfter.push(i)
    }
    if (bulletsAfter.length < 2) {
      const fallbackLine = '- Delivered end-to-end implementation with clear technical ownership and measurable outcomes.'
      lines.splice(blockEnd, 0, fallbackLine)
      blockEnd += 1
    } else if (bulletsAfter.length > 3) {
      const extraIndexes = bulletsAfter.slice(3).sort((a, b) => b - a)
      for (const removeAt of extraIndexes) {
        lines.splice(removeAt, 1)
        blockEnd -= 1
      }
    }

    index = blockEnd
  }

  return lines.join('\n')
}

const isHeadingLikeLine = (line: string): boolean => {
  const trimmed = String(line || '').trim()
  if (!trimmed) return false
  if (/^#{1,6}\s+\S+/.test(trimmed)) return true
  if (/^[A-Z][A-Z0-9 &/()+,.-]{2,}$/.test(trimmed) && trimmed.length <= 72) return true
  return false
}

const removeBlankLineAfterHeadings = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const output: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    output.push(lines[i])
    if (!isHeadingLikeLine(lines[i])) continue
    while (i + 1 < lines.length && !lines[i + 1].trim()) i += 1
  }
  return output.join('\n')
}

const removeBlankLineBeforeHeadings = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const output: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i]
    const isCurrentHeading = isHeadingLikeLine(current)
    if (isCurrentHeading) {
      while (output.length > 0 && !output[output.length - 1].trim()) output.pop()
    }
    output.push(current)
  }
  return output.join('\n')
}

const looksLikeExperienceRoleLine = (line: string): boolean => {
  const text = String(line || '').trim().replace(/^###\s+/, '')
  if (!text) return false
  if (/^(\s*)([-*]|\d+[.)])\s+/.test(text)) return false
  if (!text.includes('|')) return false
  const hasDate = /\b(19|20)\d{2}\b/.test(text) || /\bpresent\b/i.test(text)
  if (!hasDate) return false
  return /(engineer|developer|architect|scientist|analyst|manager|lead|founding)/i.test(text)
}

const ensureWorkExperienceHeadingBeforeRoles = (markdown: string, resumeSource: string): string => {
  const hasSourceExperience = /(^|\n)\s*##?\s*WORK EXPERIENCE\b/i.test(String(resumeSource || ''))
  if (!hasSourceExperience) return markdown
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const alreadyHasExperience = lines.some((raw) => /^##\s+WORK EXPERIENCE\s*$/i.test(raw.trim()))
  if (alreadyHasExperience) return markdown

  let insertIndex = -1
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) continue
    if (looksLikeExperienceRoleLine(line)) {
      insertIndex = index
      break
    }
  }
  if (insertIndex < 0) return markdown
  const next = [...lines]
  next.splice(insertIndex, 0, '## WORK EXPERIENCE')
  return next.join('\n')
}

const finalizeGeneratedMarkdown = (markdown: string, resumeSource: string): string => {
  const withNoLinkStars = stripBoldAroundLinks(markdown)
  const withHierarchy = enforceResumeHeadingHierarchy(withNoLinkStars, resumeSource)
  const withoutBoldMarkers = stripMarkdownBoldMarkers(withHierarchy)
  const withTitleDate = normalizeGithubTitleDateLayout(withoutBoldMarkers)
  const withFixedProfileLinks = normalizeProfileLabeledLinks(withTitleDate, resumeSource)
  const withHeaderLinks = normalizeHeaderContactLinks(withFixedProfileLinks, resumeSource)
  const withAlignedBullets = normalizeBulletMarkers(withHeaderLinks)
  const withMissingSectionsRestored = ensureSourceSectionsPresent(withAlignedBullets, resumeSource)
  const withSourceOrder = reorderGeneratedSectionsToSourceOrder(withMissingSectionsRestored, resumeSource)
  const withExperienceHeading = ensureWorkExperienceHeadingBeforeRoles(withSourceOrder, resumeSource)
  const withNoSkillsBullets = removeSkillsBullets(withExperienceHeading)
  const withProjectLinks = preserveProjectHyperlinksFromSource(withNoSkillsBullets, resumeSource)
  const withNaturalTitleCase = normalizeRoleAndProjectTitleCasing(withProjectLinks)
  const withProjectMinimumBullets = ensureProjectMinimumBullets(withNaturalTitleCase)
  const withEducationFromSource = ensureEducationSectionFromSourceExact(withProjectMinimumBullets, resumeSource)
  const withEducationCasing = normalizeEducationLineCasing(withEducationFromSource)
  const withTightHeadings = removeBlankLineAfterHeadings(withEducationCasing)
  const withNoBlankBeforeHeadings = removeBlankLineBeforeHeadings(withTightHeadings)
  const withUniqueKnownSections = removeDuplicateKnownSectionBlocks(withNoBlankBeforeHeadings)
  const withUniqueLines = removeDuplicateLines(withUniqueKnownSections)
  const withProjectsGuaranteed = ensureProjectsSectionFromSource(withUniqueLines, resumeSource)
  const compacted = collapseDoubleBlankLines(withProjectsGuaranteed)
  const withNormalizedDateCasing = normalizeDateRangeCasing(compacted)
  return withNormalizedDateCasing
}

const flattenTokens = (tokens: InlineToken[]): string =>
  tokens
    .map((token) => token.text)
    .join('')
    .trim()

const normalizeHeading = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim()
const isLikelyContactLine = (value: string): boolean => /@|\||linkedin|github|portfolio/i.test(String(value || ''))

const isAutoBoldTitleLine = (line: ParsedLine, currentSection: string): boolean => {
  if (line.type !== 'paragraph') return false
  if (line.tokens.some((token) => token.type === 'bold')) return false
  const text = flattenTokens(line.tokens)
  if (!text) return false
  const lower = text.toLowerCase()
  const section = normalizeHeading(currentSection)
  const hasPipes = text.includes('|')
  const hasDateRange = /\b(19|20)\d{2}\b/.test(text) || /\bpresent\b/i.test(text)
  const experienceSection = section.includes('experience')
  const projectSection = section.includes('project')
  if ((experienceSection || projectSection) && (hasPipes || hasDateRange)) return true
  if ((experienceSection || projectSection) && /engineer|developer|manager|lead|architect|analyst|scientist/.test(lower)) return true
  return false
}

const sanitizeResumeLines = (lines: ParsedLine[]): ParsedLine[] => {
  const filtered: ParsedLine[] = []
  let skipping = false
  let removedTitle = false
  for (const line of lines) {
    const lineText = line.type === 'blank' ? '' : flattenTokens(line.tokens).trim().toLowerCase()

    if (!removedTitle && line.type !== 'blank') {
      if (lineText === 'tailored resume') {
        removedTitle = true
        continue
      }
      removedTitle = true
    }

    if (line.type === 'heading') {
      if (lineText === 'keyword match notes') {
        skipping = true
        continue
      }
      if (skipping) skipping = false
    }
    if (!skipping) filtered.push(line)
  }
  return filtered
}

const renderTokens = (tokens: InlineToken[]): JSX.Element[] =>
  tokens.map((token, index) => {
    const key = `${token.type}-${index}-${token.text.slice(0, 8)}`
    if (token.type === 'link') {
      return (
        <a key={key} className="resume-link" href={token.url} target="_blank" rel="noreferrer">
          {token.text}
        </a>
      )
    }
    if (token.type === 'bold') {
      return (
        <strong key={key} className="resume-strong-inline">
          {token.text}
        </strong>
      )
    }
    return <span key={key}>{token.text}</span>
  })

type PreviewLineItem = { line: ParsedLine; sourceIndex: number }
type PreviewRenderableLine = PreviewLineItem & { isHeaderName: boolean; isHeaderContact: boolean; autoBold: boolean; sectionKey: string }

const PREVIEW_PAGE_WIDTH_PX = 816
const PREVIEW_PAGE_HEIGHT_PX = 1000
const PREVIEW_PAGE_MARGIN_PX = 57.6
const PREVIEW_CONTENT_HEIGHT_PX = PREVIEW_PAGE_HEIGHT_PX - PREVIEW_PAGE_MARGIN_PX * 2
const PREVIEW_MAX_SCALE = 0.7

const DATE_RANGE_REGEX =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\s*-\s*(?:Present|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\b/gi

const splitTextByDateRanges = (value: string): Array<{ text: string; isDate: boolean }> => {
  const text = String(value || '')
  if (!text) return []
  const parts: Array<{ text: string; isDate: boolean }> = []
  let cursor = 0
  let match: RegExpExecArray | null
  DATE_RANGE_REGEX.lastIndex = 0
  while ((match = DATE_RANGE_REGEX.exec(text)) !== null) {
    const matchText = match[0] || ''
    if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index), isDate: false })
    parts.push({ text: matchText, isDate: true })
    cursor = match.index + matchText.length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), isDate: false })
  return parts.length ? parts : [{ text, isDate: false }]
}

const hasDateRangeText = (value: string): boolean => {
  DATE_RANGE_REGEX.lastIndex = 0
  return DATE_RANGE_REGEX.test(String(value || ''))
}

const extractSkillsCategoryPrefix = (value: string): { label: string; rest: string } | null => {
  const text = String(value || '').trim()
  if (!text) return null
  const match = text.match(/^([A-Za-z][A-Za-z0-9/&+().,\-\s]{0,42}:)\s*(.+)$/)
  if (!match) return null
  return { label: match[1].trim(), rest: match[2].trim() }
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })

const uint8ToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return window.btoa(binary)
}

export default function ResumeStudio() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState<'docx' | 'pdf' | null>(null)
  const [message, setMessage] = useState('')
  const [resumeFileName, setResumeFileName] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [formatTemplate, setFormatTemplate] = useState('')
  const [promptA, setPromptA] = useState(DEFAULT_ATS_PROMPT)
  const [generatedMarkdown, setGeneratedMarkdown] = useState('')
  const [selectedFont, setSelectedFont] = useState<ResumeFont>('Calibri')
  const [downloadFileName, setDownloadFileName] = useState(DEFAULT_DOWNLOAD_NAME)
  const [paneOrder, setPaneOrder] = useState<PaneKey[]>(['inputs', 'output'])
  const [dragPane, setDragPane] = useState<PaneKey | null>(null)
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle')
  const resumeFileInputRef = useRef<HTMLInputElement | null>(null)
  const previewCardRef = useRef<HTMLElement | null>(null)
  const previewMeasureRef = useRef<HTMLDivElement | null>(null)
  const [previewPageIndexes, setPreviewPageIndexes] = useState<number[][]>([])
  const [previewScale, setPreviewScale] = useState(PREVIEW_MAX_SCALE)
  const skipFirstAutosaveRef = useRef(true)

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/user/profile-data')
        if (!response.ok) return
        const payload = (await response.json()) as {
          resumeFileName?: string
          resumeText?: string
          jobDescription?: string
          atsPrompt?: string
          templateMarkdown?: string
          generatedMarkdown?: string
          selectedFont?: string
          downloadFileName?: string
        }
        const profileResumeFileName = String(payload.resumeFileName || '')
        const profileResumeText = String(payload.resumeText || '')
        const profileJobDescription = String(payload.jobDescription || '')
        const profileAtsPrompt = String(payload.atsPrompt || '')
        const profileTemplateMarkdown = String(payload.templateMarkdown || '')
        const profileGeneratedMarkdown = String(payload.generatedMarkdown || '')
        const profileDownloadName = toDownloadStem(String(payload.downloadFileName || profileResumeFileName))

        setResumeFileName(profileResumeFileName)
        setResumeText(profileResumeText)
        if (profileJobDescription) setJobDescription(profileJobDescription.slice(0, 120_000))
        if (profileTemplateMarkdown) setFormatTemplate(profileTemplateMarkdown.slice(0, 120_000))
        if (profileAtsPrompt) setPromptA(profileAtsPrompt.slice(0, 12_000))
        if (profileGeneratedMarkdown) setGeneratedMarkdown(finalizeGeneratedMarkdown(profileGeneratedMarkdown.slice(0, 180_000), profileResumeText))
        if (isResumeFont(payload.selectedFont)) setSelectedFont(payload.selectedFont)
        setDownloadFileName(profileDownloadName)

        if (typeof window !== 'undefined') {
          const raw = window.localStorage.getItem(RESUME_STUDIO_DRAFT_KEY)
          if (raw) {
            const draft = JSON.parse(raw) as {
              jobDescription?: string
              formatTemplate?: string
              promptA?: string
              generatedMarkdown?: string
              selectedFont?: string
              downloadFileName?: string
            }
            if (!profileJobDescription && typeof draft.jobDescription === 'string') setJobDescription(draft.jobDescription.slice(0, 120_000))
            if (!profileTemplateMarkdown && typeof draft.formatTemplate === 'string') setFormatTemplate(draft.formatTemplate.slice(0, 120_000))
            if (!profileAtsPrompt && typeof draft.promptA === 'string' && draft.promptA.trim()) setPromptA(draft.promptA.slice(0, 12_000))
            if (!profileGeneratedMarkdown && typeof draft.generatedMarkdown === 'string') {
              setGeneratedMarkdown(finalizeGeneratedMarkdown(draft.generatedMarkdown.slice(0, 180_000), profileResumeText))
            }
            if (!payload.selectedFont && isResumeFont(draft.selectedFont)) setSelectedFont(draft.selectedFont)
            if (!payload.downloadFileName && typeof draft.downloadFileName === 'string') setDownloadFileName(toDownloadStem(draft.downloadFileName))
          }
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (loading || typeof window === 'undefined') return
    const payload = {
      jobDescription,
      formatTemplate,
      promptA,
      generatedMarkdown,
      selectedFont,
      downloadFileName,
    }
    window.localStorage.setItem(RESUME_STUDIO_DRAFT_KEY, JSON.stringify(payload))
  }, [loading, jobDescription, formatTemplate, promptA, generatedMarkdown, selectedFont, downloadFileName])

  useEffect(() => {
    if (!resumeFileName) return
    const nextName = toDownloadStem(resumeFileName)
    setDownloadFileName(nextName)
  }, [resumeFileName])

  useEffect(() => {
    if (loading) return
    if (skipFirstAutosaveRef.current) {
      skipFirstAutosaveRef.current = false
      return
    }
    const timer = window.setTimeout(async () => {
      setAutosaveState('saving')
      try {
        const response = await fetch('/api/user/profile-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeText: resumeText.slice(0, 120_000),
            jobDescription: jobDescription.slice(0, 120_000),
            atsPrompt: promptA.slice(0, 12_000),
            templateMarkdown: formatTemplate.slice(0, 120_000),
            generatedMarkdown: generatedMarkdown.slice(0, 180_000),
            selectedFont,
            downloadFileName: toDownloadStem(downloadFileName),
          }),
        })
        setAutosaveState(response.ok ? 'saved' : 'error')
      } catch {
        setAutosaveState('error')
      }
    }, 800)
    return () => window.clearTimeout(timer)
  }, [resumeText, jobDescription, promptA, formatTemplate, generatedMarkdown, selectedFont, downloadFileName, loading])

  const saveProfileData = async (): Promise<boolean> => {
    setSaving(true)
    try {
      const response = await fetch('/api/user/profile-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText: resumeText.slice(0, 120_000),
          jobDescription: jobDescription.slice(0, 120_000),
          atsPrompt: promptA.slice(0, 12_000),
          templateMarkdown: formatTemplate.slice(0, 120_000),
          generatedMarkdown: generatedMarkdown.slice(0, 180_000),
          selectedFont,
          downloadFileName: toDownloadStem(downloadFileName),
        }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setMessage(payload.error || 'Failed to save user data')
        return false
      }
      setMessage('Resume workspace saved.')
      return true
    } catch {
      setMessage('Failed to save user data')
      return false
    } finally {
      setSaving(false)
    }
  }

  const openResumeFilePicker = () => {
    resumeFileInputRef.current?.click()
  }

  const uploadResume = async (file: File | null) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf') && !file.name.toLowerCase().endsWith('.docx')) {
      setMessage('Only PDF or DOCX resumes are supported.')
      return
    }
    setSaving(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      const response = await fetch('/api/user/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, dataUrl }),
      })
      let payload: { error?: string; extractedText?: string } = {}
      const contentType = String(response.headers.get('content-type') || '')
      if (contentType.includes('application/json')) {
        payload = (await response.json()) as { error?: string; extractedText?: string }
      } else {
        const text = await response.text()
        payload = { error: text || `Upload failed (${response.status})` }
      }
      if (!response.ok) {
        setMessage(payload.error || 'Failed to upload resume')
        return
      }
      setResumeText(String(payload.extractedText || '').slice(0, 120_000))
      setResumeFileName(file.name)
      setJobDescription('')
      setFormatTemplate('')
      setPromptA(DEFAULT_ATS_PROMPT)
      setGeneratedMarkdown('')
      setDownloadFileName(toDownloadStem(file.name))
      setMessage('Resume replaced. Resume workspace fields reset for the new file.')
    } catch {
      setMessage('Failed to process resume upload.')
    } finally {
      setSaving(false)
    }
  }

  const generateResume = async () => {
    if (!resumeText.trim()) return setMessage('Upload/paste resume first.')
    if (!jobDescription.trim()) return setMessage('Add job description first.')
    // Clear old output immediately so the generated panel is empty during a new run.
    setGeneratedMarkdown('')
    setGenerating(true)
    setMessage('Generating resume...')
    try {
      const response = await fetch('/api/user/resume-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText,
          jobDescription,
          templateMarkdown: formatTemplate,
          promptA,
        }),
      })
      const payload = (await response.json()) as { error?: string; markdown?: string }
      if (!response.ok) {
        setMessage(payload.error || 'Failed to generate resume')
        return
      }
      const rawMarkdown = String(payload.markdown || '').trim()
      if (!rawMarkdown) {
        setMessage('Generation returned empty output. Please try again.')
        return
      }
      const finalized = finalizeGeneratedMarkdown(rawMarkdown, resumeText)
      if (!finalized.trim()) {
        setMessage('Generated output was empty after formatting. Please try again.')
        return
      }
      setGeneratedMarkdown(finalized)
      setMessage('Generated tailored resume.')
    } catch {
      setMessage('Failed to generate resume')
    } finally {
      setGenerating(false)
    }
  }

  const buildPdfBytes = async (markdownInput: string, fontChoice: ResumeFont): Promise<Uint8Array> => {
    const pdf = await import('pdf-lib')
    const doc = await pdf.PDFDocument.create()
    const isTimesFamily = fontChoice === 'Times New Roman' || fontChoice === 'Garamond'
    const font = await doc.embedFont(isTimesFamily ? pdf.StandardFonts.TimesRoman : pdf.StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(isTimesFamily ? pdf.StandardFonts.TimesRomanBold : pdf.StandardFonts.HelveticaBold)
    const pageWidth = 612
    const pageHeight = 792
    const marginX = 43.2
    const marginTop = 43.2
    const marginBottom = 43.2
    const bodySize = 10
    const lineGap = 0
    const spacingAfterParagraph = 3
    const blue = pdf.rgb(0.02, 0.39, 0.76)
    const dark = pdf.rgb(0.12, 0.12, 0.12)

    let page = doc.addPage([pageWidth, pageHeight])
    let y = pageHeight - marginTop

    const drawWrapped = (
      text: string,
      options: { bold?: boolean; color?: ReturnType<typeof pdf.rgb>; listPrefix?: string; align?: 'left' | 'center' | 'justify'; size?: number } = {},
    ) => {
      const safe = text || ''
      const firstPrefix = options.listPrefix || ''
      const words = safe.split(/\s+/).filter(Boolean)
      const lines: string[] = []
      let current = firstPrefix
      const fontSize = options.size || bodySize
      const measure = (value: string) => (options.bold ? fontBold : font).widthOfTextAtSize(value, fontSize)
      const maxWidth = pageWidth - marginX * 2

      for (const word of words) {
        const test = current ? `${current}${current === firstPrefix ? '' : ' '}${word}` : word
        if (measure(test) > maxWidth && current) {
          lines.push(current)
          current = options.listPrefix ? `${' '.repeat(firstPrefix.length)}${word}` : word
        } else {
          current = test
        }
      }
      if (current) lines.push(current)
      if (lines.length === 0) lines.push('')

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex]
        if (y < marginBottom + fontSize) {
          page = doc.addPage([pageWidth, pageHeight])
          y = pageHeight - marginTop
        }
        const drawFont = options.bold ? fontBold : font
        const width = drawFont.widthOfTextAtSize(line, fontSize)
        const x = options.align === 'center' ? Math.max(marginX, (pageWidth - width) / 2) : marginX
        const shouldJustify = options.align === 'justify' && lineIndex !== lines.length - 1 && !options.listPrefix
        if (shouldJustify && /\s/.test(line)) {
          const words = line.trim().split(/\s+/).filter(Boolean)
          if (words.length > 1) {
            const wordsWidth = words.reduce((sum, word) => sum + drawFont.widthOfTextAtSize(word, fontSize), 0)
            const gap = Math.max(0, (maxWidth - wordsWidth) / (words.length - 1))
            let cursorX = marginX
            for (const word of words) {
              page.drawText(word, {
                x: cursorX,
                y,
                size: fontSize,
                font: drawFont,
                color: options.color || dark,
              })
              cursorX += drawFont.widthOfTextAtSize(word, fontSize) + gap
            }
          } else {
            page.drawText(line, {
              x,
              y,
              size: fontSize,
              font: drawFont,
              color: options.color || dark,
            })
          }
        } else {
          page.drawText(line, {
            x,
            y,
            size: fontSize,
            font: drawFont,
            color: options.color || dark,
          })
        }
        y -= fontSize + lineGap
      }
    }

    const drawMixedNoBoldDates = (
      text: string,
      options: { bold?: boolean; color?: ReturnType<typeof pdf.rgb>; align?: 'left' | 'center' | 'justify'; size?: number } = {},
    ) => {
      const safe = String(text || '')
      const fontSize = options.size || bodySize
      const segments = splitTextByDateRanges(safe)
      const maxWidth = pageWidth - marginX * 2
      const totalWidth = segments.reduce((sum, segment) => {
        const runFont = options.bold && !segment.isDate ? fontBold : font
        return sum + runFont.widthOfTextAtSize(segment.text, fontSize)
      }, 0)

      if (totalWidth > maxWidth) {
        drawWrapped(safe, { ...options, bold: false, size: fontSize })
        return
      }

      if (y < marginBottom + fontSize) {
        page = doc.addPage([pageWidth, pageHeight])
        y = pageHeight - marginTop
      }

      let cursorX = options.align === 'center' ? Math.max(marginX, (pageWidth - totalWidth) / 2) : marginX
      for (const segment of segments) {
        const runFont = options.bold && !segment.isDate ? fontBold : font
        page.drawText(segment.text, {
          x: cursorX,
          y,
          size: fontSize,
          font: runFont,
          color: options.color || dark,
        })
        cursorX += runFont.widthOfTextAtSize(segment.text, fontSize)
      }
      y -= fontSize + lineGap
    }

    const exportLines = sanitizeResumeLines(parseMarkdown(markdownInput))
    let currentSection = ''
    let nonEmptyExportLines = 0
    for (const line of exportLines) {
      if (line.type === 'blank') {
        y -= spacingAfterParagraph
        continue
      }
      const lineText = flattenTokens(line.tokens)
      const isHeaderContact = nonEmptyExportLines === 1 && line.type === 'paragraph' && isLikelyContactLine(lineText)
      if (line.type === 'heading') {
        const headingText = flattenTokens(line.tokens)
        currentSection = headingText
        const beforeSpacing = line.level === 1 ? 0 : line.level === 2 ? 6 : 3
        const afterSpacing = line.level === 1 ? 2 : line.level === 2 ? 2 : 3
        if (nonEmptyExportLines > 0) y -= beforeSpacing
        if (line.level === 1) {
          if (hasDateRangeText(headingText)) drawMixedNoBoldDates(headingText, { bold: true, color: dark, align: 'center', size: 14 })
          else drawWrapped(headingText, { bold: true, color: dark, align: 'center', size: 14 })
        } else if (line.level === 3 && line.tokens.some((token) => token.type === 'link')) {
          const plainHeadingText = line.tokens.map((token) => token.text).join('')
          if (hasDateRangeText(plainHeadingText)) drawMixedNoBoldDates(plainHeadingText, { bold: true, color: dark, size: 10 })
          else drawWrapped(plainHeadingText, { bold: true, color: dark, size: 10 })
        } else {
          if (hasDateRangeText(headingText)) drawMixedNoBoldDates(headingText, { bold: true, color: dark, size: 10 })
          else drawWrapped(headingText, { bold: true, color: dark, size: 10 })
        }
        y -= afterSpacing
        nonEmptyExportLines += 1
        continue
      }
      const autoBoldLine = isAutoBoldTitleLine(line, currentSection)
      const listPrefix = line.type === 'bullet' ? (line.marker === 'ordered' ? `${line.number || '1'}. ` : '\u2022 ') : ''
      const shouldBoldLine = autoBoldLine || line.tokens.some((token) => token.type === 'bold')
      const drawOpts = {
        listPrefix,
        bold: shouldBoldLine,
        align: isHeaderContact ? ('center' as const) : ('justify' as const),
        color: dark,
      }
      if (!listPrefix && shouldBoldLine && hasDateRangeText(lineText)) drawMixedNoBoldDates(lineText, drawOpts)
      else drawWrapped(lineText, drawOpts)
      y -= spacingAfterParagraph
      nonEmptyExportLines += 1
    }

    return doc.save()
  }

  const createDocxBlob = async (markdownForExport: string): Promise<Blob> => {
      const docx = await import('docx')
      const blue = '0563C1'
      const dark = '111111'
      const bodySize = 20 // 10pt (half-points)
      const children: InstanceType<typeof docx.Paragraph>[] = []
      const exportLines = sanitizeResumeLines(parseMarkdown(markdownForExport))
      let currentSection = ''
      let nonEmptyExportLines = 0
      const pushRunsWithDateControl = (target: Array<InstanceType<typeof docx.TextRun>>, text: string, bold: boolean, color?: string) => {
        const segments = splitTextByDateRanges(text)
        for (const segment of segments) {
          target.push(
            new docx.TextRun({
              text: segment.text,
              font: selectedFont,
              size: bodySize,
              bold: segment.isDate ? false : bold,
              color,
            }),
          )
        }
      }

      for (const line of exportLines) {
        if (line.type === 'blank') {
          children.push(
            new docx.Paragraph({
              contextualSpacing: true,
              spacing: { before: 0, after: 60, line: 240, lineRule: docx.LineRuleType.AUTO },
            }),
          )
          continue
        }
        const lineText = flattenTokens(line.tokens)
        const isHeaderContact = line.type === 'paragraph' && nonEmptyExportLines === 1 && isLikelyContactLine(lineText)

        if (line.type === 'heading') {
          const headingText = flattenTokens(line.tokens)
          currentSection = headingText
          const headingLevel =
            line.level === 1 ? docx.HeadingLevel.TITLE : line.level === 2 ? docx.HeadingLevel.HEADING_1 : docx.HeadingLevel.HEADING_2
          const headingStyle = line.level === 1 ? 'Title' : line.level === 2 ? 'Heading1' : 'Heading2'
          const headingSpacing =
            line.level === 1
              ? { before: 0, after: 40, line: 240, lineRule: docx.LineRuleType.AUTO }
              : line.level === 2
                ? { before: 120, after: 40, line: 240, lineRule: docx.LineRuleType.AUTO }
                : { before: 60, after: 60, line: 240, lineRule: docx.LineRuleType.AUTO }
          const headingChildren: Array<InstanceType<typeof docx.TextRun> | InstanceType<typeof docx.ExternalHyperlink>> = []
          for (const token of line.tokens) {
            if (token.type === 'link') {
              headingChildren.push(
                new docx.ExternalHyperlink({
                  link: token.url,
                  children: [
                    new docx.TextRun({
                      text: token.text,
                      font: selectedFont,
                      size: line.level === 1 ? 28 : 20,
                      color: blue,
                      bold: true,
                      underline: {},
                    }),
                  ],
                }),
              )
              continue
            }
            const segments = splitTextByDateRanges(token.text)
            for (const segment of segments) {
              headingChildren.push(
                new docx.TextRun({
                  text: segment.text,
                  font: selectedFont,
                  size: line.level === 1 ? 28 : 20,
                  bold: segment.isDate ? false : true,
                  color: dark,
                }),
              )
            }
          }
          children.push(
            new docx.Paragraph({
              heading: headingLevel,
              style: headingStyle,
              alignment: line.level === 1 ? docx.AlignmentType.CENTER : undefined,
              contextualSpacing: true,
              spacing: headingSpacing,
              children: headingChildren,
            }),
          )
          nonEmptyExportLines += 1
          continue
        }

        const childrenRuns: Array<InstanceType<typeof docx.TextRun> | InstanceType<typeof docx.ExternalHyperlink>> = []
        const autoBoldLine = isAutoBoldTitleLine(line, currentSection)
        const shouldBoldLine = autoBoldLine
        const skillsPrefix =
          line.type === 'paragraph' && normalizeSectionKey(currentSection) === 'skills' ? extractSkillsCategoryPrefix(lineText) : null

        if (skillsPrefix) {
          childrenRuns.push(new docx.TextRun({ text: `${skillsPrefix.label} `, font: selectedFont, size: bodySize, bold: true }))
          childrenRuns.push(new docx.TextRun({ text: skillsPrefix.rest, font: selectedFont, size: bodySize }))
        } else {
          for (const token of line.tokens) {
            if (token.type === 'text') {
              const localRuns: InstanceType<typeof docx.TextRun>[] = []
              pushRunsWithDateControl(localRuns, token.text, shouldBoldLine)
              childrenRuns.push(...localRuns)
            } else if (token.type === 'bold') {
              const localRuns: InstanceType<typeof docx.TextRun>[] = []
              pushRunsWithDateControl(localRuns, token.text, isHeaderContact ? false : true)
              childrenRuns.push(...localRuns)
            } else {
              childrenRuns.push(
                new docx.ExternalHyperlink({
                  link: token.url,
                  children: [
                    new docx.TextRun({
                      text: token.text,
                      font: selectedFont,
                      size: bodySize,
                      color: blue,
                      bold: isHeaderContact ? false : shouldBoldLine,
                      underline: {},
                    }),
                  ],
                }),
              )
            }
          }
        }

        const paragraphChildren: Array<InstanceType<typeof docx.TextRun> | InstanceType<typeof docx.ExternalHyperlink>> = []
        let numbering: { reference: string; level: number } | undefined
        if (line.type === 'bullet') {
          if (line.marker === 'ordered') {
            paragraphChildren.push(
              new docx.TextRun({
                text: `${line.number || '1'}. `,
                font: selectedFont,
                size: bodySize,
                color: dark,
              }),
            )
          } else {
            numbering = { reference: 'resume-bullets', level: 0 }
          }
        }
        paragraphChildren.push(...childrenRuns)
        children.push(
          new docx.Paragraph({
            numbering,
            contextualSpacing: true,
            alignment: isHeaderContact ? docx.AlignmentType.CENTER : docx.AlignmentType.JUSTIFIED,
            spacing: { before: 0, after: 60, line: 240, lineRule: docx.LineRuleType.AUTO },
            children: paragraphChildren,
          }),
        )
        nonEmptyExportLines += 1
      }

      const document = new docx.Document({
        numbering: {
          config: [
            {
              reference: 'resume-bullets',
              levels: [
                {
                  level: 0,
                  format: docx.LevelFormat.BULLET,
                  text: '\u25CF',
                  alignment: docx.AlignmentType.LEFT,
                  suffix: docx.LevelSuffix.SPACE,
                  style: {
                    paragraph: {
                      indent: {
                        left: 360,
                        hanging: 180,
                      },
                    },
                    run: {
                      font: selectedFont,
                      size: 16, // 8pt bullet marker
                      color: dark,
                    },
                  },
                },
              ],
            },
          ],
        },
        sections: [
          {
            properties: {
              page: {
                size: {
                  width: 12240,
                  height: 15840,
                },
                margin: {
                  top: 864,
                  right: 864,
                  bottom: 864,
                  left: 864,
                },
              },
            },
            children,
          },
        ],
      })
      return docx.Packer.toBlob(document)
  }

  const downloadDocx = async () => {
    if (!generatedMarkdown.trim()) return setMessage('Generate resume first.')
    setDownloading('docx')
    const fileStem = toDownloadStem(downloadFileName || resumeFileName)
    try {
      const markdownForExport = finalizeGeneratedMarkdown(generatedMarkdown, resumeText)
      const blob = await createDocxBlob(markdownForExport)
      downloadBlob(blob, `${fileStem}.docx`)
    } catch {
      setMessage('Failed to create DOCX download')
    } finally {
      setDownloading(null)
    }
  }

  const downloadPdf = async () => {
    if (!generatedMarkdown.trim()) return setMessage('Generate resume first.')
    setDownloading('pdf')
    const fileStem = toDownloadStem(downloadFileName || resumeFileName)
    try {
      const markdownForExport = finalizeGeneratedMarkdown(generatedMarkdown, resumeText)
      const docxBlob = await createDocxBlob(markdownForExport)
      const docxBytes = new Uint8Array(await docxBlob.arrayBuffer())
      const response = await fetch('/api/user/convert-word-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileStem,
          docxBase64: uint8ToBase64(docxBytes),
        }),
      })
      if (!response.ok) {
        const contentType = String(response.headers.get('content-type') || '')
        const message = contentType.includes('application/json')
          ? String(((await response.json()) as { error?: string }).error || '')
          : String(await response.text())
        throw new Error(message || 'Word-based PDF conversion failed')
      }
      const pdfBlob = await response.blob()
      downloadBlob(pdfBlob, `${fileStem}.pdf`)
    } catch (error) {
      const details = error instanceof Error ? error.message : ''
      setMessage(details ? `PDF conversion failed: ${details}` : 'Failed to create PDF download via Word converter')
    } finally {
      setDownloading(null)
    }
  }

  const swapPanes = (from: PaneKey, to: PaneKey) => {
    if (from === to) return
    setPaneOrder((current) => {
      const next = [...current]
      const fromIndex = next.indexOf(from)
      const toIndex = next.indexOf(to)
      if (fromIndex < 0 || toIndex < 0) return current
      ;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
      return next
    })
  }

  const previewRenderableLines = useMemo<PreviewRenderableLine[]>(() => {
    const lines = sanitizeResumeLines(parseMarkdown(generatedMarkdown))
    const nonEmptyLineIndexes = lines
      .map((line, index) => (line.type === 'blank' ? -1 : index))
      .filter((index) => index >= 0)
    const headerNameIndex = nonEmptyLineIndexes[0] ?? -1
    const headerContactIndex = nonEmptyLineIndexes[1] ?? -1

    let currentSection = ''
    return lines.map((line, sourceIndex) => {
      if (line.type === 'heading') currentSection = flattenTokens(line.tokens)
      const lineText = flattenTokens(line.type === 'blank' ? [] : line.tokens)
      return {
        line,
        sourceIndex,
        isHeaderName: sourceIndex === headerNameIndex,
        isHeaderContact: sourceIndex === headerContactIndex && isLikelyContactLine(lineText),
        autoBold: isAutoBoldTitleLine(line, currentSection),
        sectionKey: normalizeSectionKey(currentSection),
      }
    })
  }, [generatedMarkdown])

  useEffect(() => {
    if (!generatedMarkdown.trim()) {
      setPreviewPageIndexes([])
      return
    }
    const measureNode = previewMeasureRef.current
    if (!measureNode) return

    const raf = window.requestAnimationFrame(() => {
      const lineNodes = Array.from(measureNode.querySelectorAll<HTMLElement>('[data-preview-line-index]'))
      if (!lineNodes.length) {
        setPreviewPageIndexes([])
        return
      }

      const nextPages: number[][] = [[]]
      let page = 0
      let usedHeight = 0

      for (const lineNode of lineNodes) {
        const index = Number(lineNode.dataset.previewLineIndex)
        const lineHeight = lineNode.getBoundingClientRect().height
        if (nextPages[page].length > 0 && usedHeight + lineHeight > PREVIEW_CONTENT_HEIGHT_PX + 0.5) {
          page += 1
          nextPages[page] = []
          usedHeight = 0
        }
        nextPages[page].push(index)
        usedHeight += lineHeight
      }

      setPreviewPageIndexes(nextPages.filter((group) => group.length > 0))
    })

    return () => window.cancelAnimationFrame(raf)
  }, [generatedMarkdown, selectedFont, previewRenderableLines])

  useEffect(() => {
    const node = previewCardRef.current
    if (!node) return

    const updateScale = () => {
      const availableWidth = Math.max(320, node.clientWidth - 34)
      const nextScale = Math.min(PREVIEW_MAX_SCALE, availableWidth / PREVIEW_PAGE_WIDTH_PX)
      setPreviewScale(nextScale)
    }

    updateScale()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => updateScale())
    observer.observe(node)
    return () => observer.disconnect()
  }, [paneOrder, generatedMarkdown])

  const renderPreviewLine = (entry: PreviewRenderableLine, key: string) => {
    const { line, isHeaderName, isHeaderContact, autoBold, sectionKey } = entry
    if (line.type === 'blank') return <div key={key} className="resume-preview-line resume-preview-line-blank" />
    if (line.type === 'heading') {
      const headingClass =
        line.level === 1 ? 'resume-preview-line-heading-1' : line.level === 2 ? 'resume-preview-line-heading-2' : 'resume-preview-line-heading-3'
      const headingText = flattenTokens(line.tokens)
      return (
        <p key={key} className={`resume-preview-line ${headingClass}`}>
          {line.tokens.map((token, tokenIndex) => {
            if (token.type === 'link') {
              return (
                <a key={`${key}-heading-link-${tokenIndex}`} className="resume-link" href={token.url} target="_blank" rel="noreferrer">
                  {token.text}
                </a>
              )
            }
            return splitTextByDateRanges(token.text).map((part, partIndex) =>
              part.isDate ? (
                <span key={`${key}-heading-date-${tokenIndex}-${partIndex}`} className="resume-date-unbold">
                  {part.text}
                </span>
              ) : (
                <span key={`${key}-heading-text-${tokenIndex}-${partIndex}`}>{part.text}</span>
              ),
            )
          })}
        </p>
      )
    }
    if (line.type === 'bullet') {
      if (line.marker === 'ordered') {
        return (
          <ol key={key} className="resume-preview-line resume-preview-line-numbered-list" start={Number(line.number || '1')}>
            <li className={autoBold ? 'resume-preview-line-auto-bold' : ''}>{renderTokens(line.tokens)}</li>
          </ol>
        )
      }
      return (
        <ul key={key} className="resume-preview-line resume-preview-line-bullet-list">
          <li className={autoBold ? 'resume-preview-line-auto-bold' : ''}>{renderTokens(line.tokens)}</li>
        </ul>
      )
    }
    return (
      <p
        key={key}
        className={[
          'resume-preview-line',
          'resume-preview-line-paragraph',
          isHeaderName ? 'resume-preview-line-header-name' : '',
          isHeaderContact ? 'resume-preview-line-header-contact' : '',
          autoBold ? 'resume-preview-line-auto-bold' : '',
        ]
          .join(' ')
          .trim()}
      >
        {line.type === 'paragraph' && sectionKey === 'skills' ? (
          (() => {
            const split = extractSkillsCategoryPrefix(flattenTokens(line.tokens))
            if (!split) return renderTokens(line.tokens)
            return (
              <>
                <strong className="resume-strong-inline">{split.label}</strong> {split.rest}
              </>
            )
          })()
        ) : line.type === 'paragraph' && autoBold && !isHeaderName && !isHeaderContact ? (
          splitTextByDateRanges(flattenTokens(line.tokens)).map((part, index) =>
            part.isDate ? (
              <span key={`${key}-para-date-${index}`} className="resume-date-unbold">
                {part.text}
              </span>
            ) : (
              <strong key={`${key}-para-bold-${index}`} className="resume-strong-inline">
                {part.text}
              </strong>
            ),
          )
        ) : (
          renderTokens(line.tokens)
        )}
      </p>
    )
  }

  if (loading) {
    return <div className="feature-placeholder"><p className="feature-placeholder-text">Loading resume studio...</p></div>
  }
  const previewPageGroups =
    previewPageIndexes.length > 0 ? previewPageIndexes : previewRenderableLines.length > 0 ? [previewRenderableLines.map((_, index) => index)] : []

  const inputPane = (
    <section className="resume-input-pane">
      <div className="resume-pane-top">
        <div>
          <h2 className="resume-pane-title">Resume Inputs</h2>
          {/* <p className="resume-pane-subtitle">Upload resume + job description + prompt.</p> */}
        </div>
        <div
          className="resume-drag-handle"
          title="Drag to swap panels"
          aria-label="Drag to swap panels"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            setDragPane('inputs')
          }}
          onDragEnd={() => setDragPane(null)}
        >
          <span className="resume-drag-dots" />
          <span className="resume-drag-dots" />
          <span className="resume-drag-dots" />
          <span className="resume-drag-dots" />
        </div>
      </div>

      <label className="metric-label mt-3">Upload Resume (PDF/DOCX)</label>
      <div className="settings-file-picker">
        <button type="button" className="settings-file-btn" onClick={openResumeFilePicker}>
          Choose File
        </button>
        <input
          ref={resumeFileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => {
            const file = event.target.files?.[0] || null
            void uploadResume(file)
            event.currentTarget.value = ''
          }}
        />
        <span className="settings-file-name">{resumeFileName || 'No file chosen'}</span>
      </div>
      {/* {resumeFileName ? <p className="settings-hint mt-1">Uploaded: {resumeFileName}</p> : null} */}

      <label className="metric-label mt-3">Resume Text</label>
      <textarea
        className="apple-input resume-textarea"
        value={resumeText}
        onChange={(event) => setResumeText(event.target.value.slice(0, 120_000))}
        placeholder="Resume text (extracted or pasted)."
      />
      {/* {autosaveState !== 'idle' ? (
        <p className="settings-hint mt-1">
          {autosaveState === 'saving' ? 'Autosaving resume text...' : autosaveState === 'saved' ? 'Resume text autosaved.' : 'Autosave failed.'}
        </p>
      ) : null} */}

      <label className="metric-label mt-3">Job Description</label>
      <textarea
        className="apple-input resume-textarea"
        value={jobDescription}
        onChange={(event) => setJobDescription(event.target.value.slice(0, 120_000))}
        placeholder="Paste target job description here."
      />

      {/* <label className="metric-label mt-3">Format Template (Optional)</label>
      <textarea
        className="apple-input resume-textarea short"
        value={formatTemplate}
        onChange={(event) => setFormatTemplate(event.target.value.slice(0, 120_000))}
        placeholder="Paste your best resume format/template markdown. The generator will mirror this structure and style."
      /> */}

      <label className="metric-label mt-3">ATS Prompt</label>
      <textarea
        className="apple-input resume-textarea short"
        value={promptA}
        onChange={(event) => setPromptA(event.target.value.slice(0, 12_000))}
        placeholder="ATS rewrite instructions..."
      />

      <div className="resume-input-actions">
        <button type="button" className="action-pill secondary" disabled={saving} onClick={() => void saveProfileData()}>
          {saving ? 'Saving...' : 'Save User Data'}
        </button>
        <button type="button" className="action-pill" disabled={generating} onClick={() => void generateResume()}>
          {generating ? 'Generating...' : 'Generate Resume'}
        </button>
      </div>
      {message ? <p className="settings-hint mt-2">{message}</p> : null}
    </section>
  )

  const outputPane = (
    <section className="resume-output-pane">
      <div className="resume-output-head">
        <div>
          <h2 className="resume-pane-title">Generated Document</h2>
          {/* <p className="resume-pane-subtitle">Edit output before download/links</p> */}
        </div>
        <div className="resume-output-actions">
          <div className="resume-download-actions">
            <select className="apple-input resume-font-select" value={selectedFont} onChange={(event) => setSelectedFont(event.target.value as ResumeFont)}>
              {RESUME_FONT_OPTIONS.map((fontName) => (
                <option key={fontName} value={fontName}>
                  {fontName}
                </option>
              ))}
            </select>
            <button type="button" className="action-pill secondary" disabled={!generatedMarkdown || downloading === 'docx'} onClick={() => void downloadDocx()}>
              {downloading === 'docx' ? 'Preparing DOCX...' : 'Download DOCX'}
            </button>
            <button type="button" className="action-pill secondary" disabled={!generatedMarkdown || downloading === 'pdf'} onClick={() => void downloadPdf()}>
              {downloading === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}
            </button>
          </div>
          <div
            className="resume-drag-handle"
            title="Drag to swap panels"
            aria-label="Drag to swap panels"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              setDragPane('output')
            }}
            onDragEnd={() => setDragPane(null)}
          >
            <span className="resume-drag-dots" />
            <span className="resume-drag-dots" />
            <span className="resume-drag-dots" />
            <span className="resume-drag-dots" />
          </div>
        </div>
      </div>

      <label className="metric-label mt-3">Generated Markdown (Editable)</label>
      <textarea
        className="apple-input resume-textarea resume-textarea-generated"
        value={generatedMarkdown}
        onChange={(event) => setGeneratedMarkdown(event.target.value.slice(0, 180_000))}
        placeholder="Generated markdown will appear here. You can edit before downloading."
      />

            {generatedMarkdown ? (
        <div ref={previewMeasureRef} className={`resume-preview-measure resume-font-${selectedFont.toLowerCase().replace(/\s+/g, '-')}`} aria-hidden>
          <div className="resume-preview-measure-sheet">
            {previewRenderableLines.map((entry, index) => (
              <div key={`measure-${index}`} data-preview-line-index={index} className="resume-preview-line-block">
                {renderPreviewLine(entry, `measure-line-${index}`)}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <article
        ref={previewCardRef}
        className="resume-preview-card"
        style={{ ['--resume-preview-scale' as any]: String(previewScale) }}
      >
        {!generatedMarkdown ? (
          <p className="resume-preview-empty">{generating ? 'Generating resume...' : 'Generate a tailored resume to preview and download.'}</p>
        ) : (
          <div className="resume-preview-pages-wrap">
            {previewPageGroups.map((pageLineIndexes, pageIndex) => {
              return (
                <section key={`preview-page-${pageIndex}`} className="resume-preview-page-fit">
                  <p className="resume-preview-page-label">Page {pageIndex + 1}</p>
                  <article className="resume-preview-page">
                    <div className={`resume-preview-content resume-font-${selectedFont.toLowerCase().replace(/\s+/g, '-')}`}>
                      {pageLineIndexes.map((lineIndex) => {
                        const entry = previewRenderableLines[lineIndex]
                        if (!entry) return null
                        return (
                          <div key={`page-${pageIndex}-line-${lineIndex}`} className="resume-preview-line-block">
                            {renderPreviewLine(entry, `page-line-${pageIndex}-${lineIndex}`)}
                          </div>
                        )
                      })}
                    </div>
                  </article>
                </section>
              )
            })}
          </div>
        )}
      </article>

      <div className="resume-download-footer">
        <div className="resume-download-name-wrap">
          <label className="metric-label" htmlFor="resume-download-name">
            File Name
          </label>
          <input
            id="resume-download-name"
            className="apple-input resume-download-name-input"
            value={downloadFileName}
            onChange={(event) => setDownloadFileName(event.target.value.slice(0, 180))}
            placeholder="Enter file name"
          />
        </div>
      </div>
    </section>
  )

  return (
    <div className="resume-studio-shell">
      {paneOrder.map((pane) => (
        <div
          key={pane}
          className={`resume-pane-shell resume-pane-shell-${pane} ${dragPane === pane ? 'is-dragging' : ''}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            if (dragPane) swapPanes(dragPane, pane)
            setDragPane(null)
          }}
          onDragEnd={() => setDragPane(null)}
        >
          {pane === 'inputs' ? inputPane : outputPane}
        </div>
      ))}
    </div>
  )
}
