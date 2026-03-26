import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabaseAdmin'
import { validateLlmProviderModelAndKey } from '../../../lib/llmValidation'

type GenerateBody = {
  jobDescription?: string
  templateMarkdown?: string
  promptA?: string
  resumeText?: string
}

const toStringValue = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const LLM_TIMEOUT_MS = 60_000
const isUpperHeadingLike = (value: string): boolean => /^[A-Z][A-Z0-9 &/()+,.\-]{2,}$/.test(value) && value.length <= 72
const SECTION_HEADING_MAP: Record<string, string> = {
  summary: 'SUMMARY',
  experience: 'WORK EXPERIENCE',
  projects: 'PROJECT EXPERIENCE',
  skills: 'TECHNICAL SKILLS',
  education: 'EDUCATION',
  certifications: 'CERTIFICATIONS',
}
const KNOWN_SECTION_KEYS = new Set(Object.keys(SECTION_HEADING_MAP))
const isKnownSectionHeadingLine = (line: string): boolean => {
  const raw = String(line || '').trim()
  if (!raw) return false
  const hasMarkdownHeading = /^#{1,6}\s+\S+/.test(raw)
  const hasBoldMarkerHeading = /^\*\*[^*]+\*\*$/.test(raw)
  const isAllCapsHeading = /[A-Z]/.test(raw) && raw === raw.toUpperCase()
  const headingCandidate = raw
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/\*\*/g, '')
    .trim()
  if (!headingCandidate) return false
  if (!KNOWN_SECTION_KEYS.has(normalizeSectionKey(headingCandidate))) return false
  return hasMarkdownHeading || hasBoldMarkerHeading || isAllCapsHeading
}
const normalizeSectionKey = (value: string): string => {
  const cleaned = String(value || '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/\*\*/g, '')
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
  const headingCandidate = raw
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/\*\*/g, '')
    .trim()
  if (!headingCandidate) return false
  if (/^#{1,6}\s+\S+/.test(raw)) return true
  const key = normalizeSectionKey(headingCandidate)
  if (KNOWN_SECTION_KEYS.has(key)) return true
  return isUpperHeadingLike(headingCandidate)
}

const extractSectionKeysFromText = (value: string): string[] => {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const raw of String(value || '').replace(/\r/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line || !isKnownSectionHeadingLine(line)) continue
    const key = normalizeSectionKey(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    ordered.push(key)
  }
  return ordered
}

const extractSourceSectionBlocks = (resumeText: string): Map<string, string[]> => {
  const lines = String(resumeText || '').replace(/\r/g, '\n').split('\n')
  const blocks = new Map<string, string[]>()
  let index = 0
  while (index < lines.length) {
    const line = lines[index]?.trim() || ''
    if (!line || !isKnownSectionHeadingLine(line)) {
      index += 1
      continue
    }
    const key = normalizeSectionKey(line)
    if (!KNOWN_SECTION_KEYS.has(key)) {
      index += 1
      continue
    }
    const content: string[] = []
    let cursor = index + 1
    while (cursor < lines.length) {
      const next = lines[cursor]?.trim() || ''
      if (next && isKnownSectionHeadingLine(next)) break
      if (next) content.push(next)
      cursor += 1
    }
    if (content.length) blocks.set(key, [`## ${SECTION_HEADING_MAP[key]}`, ...content])
    index = cursor
  }
  return blocks
}

const ensureRequiredSectionsFromSource = (generated: string, resumeText: string, requiredKeys: string[]): string => {
  const presentKeys = new Set(extractSectionKeysFromText(generated))
  const sourceBlocks = extractSourceSectionBlocks(resumeText)
  const lines = String(generated || '').replace(/\r/g, '\n').split('\n')
  const output = [...lines]
  let changed = false
  for (const key of requiredKeys) {
    if (presentKeys.has(key)) continue
    const block = sourceBlocks.get(key)
    if (!block || block.length < 2) continue
    if (output.length && output[output.length - 1].trim()) output.push('')
    output.push(...block)
    changed = true
  }
  return changed ? output.join('\n').trim() : generated
}

const dedupeEducationSectionLines = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const educationStart = lines.findIndex((line) => /^##\s+/.test(line.trim()) && normalizeSectionKey(line) === 'education')
  if (educationStart < 0) return markdown

  let educationEnd = educationStart + 1
  while (educationEnd < lines.length && !/^##\s+/.test(lines[educationEnd].trim())) educationEnd += 1

  type Candidate = { index: number; score: number }
  const bestBySchoolKey = new Map<string, Candidate>()
  const removeIndexes = new Set<number>()

  const schoolKey = (value: string): string =>
    String(value || '')
      .replace(/^###\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, '$1')
      .replace(/\s+/g, ' ')
      .trim()
      .split('|')[0]
      .trim()
      .toLowerCase()

  const schoolScore = (value: string): number => {
    const text = String(value || '').replace(/\*\*/g, '').trim()
    return text.length + (text.includes('|') ? 30 : 0) + (/\b(19|20)\d{2}\b/.test(text) ? 20 : 0)
  }

  for (let i = educationStart + 1; i < educationEnd; i += 1) {
    const line = lines[i].trim()
    if (!line) continue
    if (/^(\s*)([-*]|\d+[.)])\s+/.test(line)) continue
    const key = schoolKey(line)
    if (!key) continue
    const next: Candidate = { index: i, score: schoolScore(line) }
    const existing = bestBySchoolKey.get(key)
    if (!existing) {
      bestBySchoolKey.set(key, next)
      continue
    }
    if (next.score > existing.score) {
      removeIndexes.add(existing.index)
      bestBySchoolKey.set(key, next)
    } else {
      removeIndexes.add(next.index)
    }
  }

  if (!removeIndexes.size) return markdown
  return lines.filter((_, index) => !removeIndexes.has(index)).join('\n')
}

const normalizeEducationLine = (value: string): string =>
  String(value || '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim()

const extractEducationDegreeLineFromSource = (resumeText: string): string => {
  const lines = String(resumeText || '').replace(/\r/g, '\n').split('\n')
  let inEducation = false
  const candidates: string[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (isKnownSectionHeadingLine(line)) {
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
    if (/@|linkedin|github|portfolio|https?:\/\/|www\./i.test(line)) continue
    if (/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(line)) continue
    candidates.push(normalizeEducationLine(line))
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

const ensureEducationDegreeLineFromSource = (markdown: string, resumeText: string): string => {
  const sourceDegree = extractEducationDegreeLineFromSource(resumeText)
  if (!sourceDegree) return markdown
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const educationStart = lines.findIndex((line) => /^##\s+/.test(line.trim()) && normalizeSectionKey(line) === 'education')
  if (educationStart < 0) return markdown

  let educationEnd = educationStart + 1
  while (educationEnd < lines.length && !/^##\s+/.test(lines[educationEnd].trim())) educationEnd += 1

  const degreeAlreadyPresent = lines
    .slice(educationStart + 1, educationEnd)
    .map((line) => normalizeEducationLine(line).toLowerCase())
    .includes(sourceDegree.toLowerCase())
  if (degreeAlreadyPresent) return markdown

  let insertAt = educationStart + 1
  while (insertAt < educationEnd && !lines[insertAt].trim()) insertAt += 1
  lines.splice(insertAt, 0, sourceDegree)
  return lines.join('\n')
}

const removeRedundantEducationMetaBullets = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const educationStart = lines.findIndex((line) => /^##\s+/.test(line.trim()) && normalizeSectionKey(line) === 'education')
  if (educationStart < 0) return markdown

  let educationEnd = educationStart + 1
  while (educationEnd < lines.length && !/^##\s+/.test(lines[educationEnd].trim())) educationEnd += 1

  const plainEducationLines = lines
    .slice(educationStart + 1, educationEnd)
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
    if (index > educationStart && index < educationEnd && isRedundantMetaBullet(lines[index])) continue
    output.push(lines[index])
  }
  return output.join('\n')
}

const extractEducationBlockFromSource = (resumeText: string): string[] => {
  const lines = String(resumeText || '').replace(/\r/g, '\n').split('\n')
  let inEducation = false
  const content: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (inEducation) content.push('')
      continue
    }
    if (isKnownSectionHeadingLine(line)) {
      const key = normalizeSectionKey(line)
      if (key === 'education') {
        inEducation = true
        continue
      }
      if (inEducation) break
      continue
    }
    if (!inEducation) continue
    content.push(normalizeEducationLine(line))
  }
  return content.filter((line, index, arr) => !(line === '' && (index === 0 || index === arr.length - 1)))
}

const ensureEducationSectionFromSourceExact = (markdown: string, resumeText: string): string => {
  const sourceContent = extractEducationBlockFromSource(resumeText)
  if (!sourceContent.length) return markdown

  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const educationStart = lines.findIndex((line) => /^##\s+/.test(line.trim()) && normalizeSectionKey(line) === 'education')

  if (educationStart < 0) {
    const output = [...lines]
    if (output.length && output[output.length - 1].trim()) output.push('')
    output.push('## EDUCATION', ...sourceContent)
    return output.join('\n')
  }

  let educationEnd = educationStart + 1
  while (educationEnd < lines.length && !/^##\s+/.test(lines[educationEnd].trim())) educationEnd += 1
  const output = [...lines.slice(0, educationStart + 1), ...sourceContent, ...lines.slice(educationEnd)]
  return output.join('\n')
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
  const emittedKeys = new Set<string>()
  for (const block of blocks) {
    if (!block.key || !KNOWN_SECTION_KEYS.has(block.key)) {
      output.push(...block.lines)
      continue
    }
    if (emittedKeys.has(block.key)) continue
    emittedKeys.add(block.key)
    output.push(...(bestBlockByKey.get(block.key)?.lines || block.lines))
  }

  return output.join('\n').trim()
}

const normalizeLooseTitle = (value: string): string =>
  String(value || '')
    .replace(/^###\s+/, '')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, '$1')
    .split('|')[0]
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const extractProjectLinkMapFromSource = (resumeText: string): Map<string, { title: string; url: string; date: string }> => {
  const lines = String(resumeText || '').replace(/\r/g, '\n').split('\n')
  const map = new Map<string, { title: string; url: string; date: string }>()
  let currentSection = ''
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (isKnownSectionHeadingLine(line)) {
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

const preserveProjectHyperlinksFromSource = (markdown: string, resumeText: string): string => {
  const sourceLinks = extractProjectLinkMapFromSource(resumeText)
  if (!sourceLinks.size) return markdown

  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  let currentSection = ''
  const output = lines.map((raw) => {
    const line = raw.trim()
    if (/^##\s+/.test(line)) {
      currentSection = normalizeSectionKey(line)
      return raw
    }
    if (currentSection !== 'projects') return raw
    if (!/^###\s+/.test(line)) return raw
    const titleText = line.replace(/^###\s+/, '').trim()
    if (/\[[^\]]+\]\((https?:\/\/|mailto:)[^)]+\)/i.test(titleText)) return raw

    const parts = titleText.split('|').map((part) => part.trim()).filter(Boolean)
    const titleOnly = parts[0] || titleText
    const sourceLink = sourceLinks.get(normalizeLooseTitle(titleOnly))
    if (!sourceLink) return raw
    const date = parts.slice(1).join(' | ') || sourceLink.date
    const linkedTitle = `[${sourceLink.title}](${sourceLink.url})`
    return `### ${date ? `${linkedTitle} | ${date}` : linkedTitle}`
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
  const toNaturalCase = (text: string): string => text.replace(/[A-Za-z][A-Za-z0-9/+.-]*/g, (word) => toTitleCaseToken(word))

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

const ensureProjectBulletsTwoToThree = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  let currentSection = ''
  let index = 0

  const isBullet = (line: string): boolean => /^(\s*)([-*]|\d+[.)])\s+/.test(line)
  while (index < lines.length) {
    const line = lines[index]?.trim() || ''
    if (!line) {
      index += 1
      continue
    }
    if (/^##\s+/.test(line)) {
      currentSection = normalizeSectionKey(line)
      index += 1
      continue
    }
    if (currentSection !== 'projects' || !/^###\s+/.test(line)) {
      index += 1
      continue
    }

    const blockStart = index + 1
    let blockEnd = blockStart
    while (blockEnd < lines.length) {
      const t = lines[blockEnd]?.trim() || ''
      if (/^##\s+/.test(t) || /^###\s+/.test(t)) break
      blockEnd += 1
    }

    for (let i = blockStart; i < blockEnd; i += 1) {
      const t = lines[i]?.trim() || ''
      if (!t) continue
      if (!isBullet(t)) lines[i] = `- ${t}`
    }

    const bulletIndexes: number[] = []
    for (let i = blockStart; i < blockEnd; i += 1) {
      if (isBullet(lines[i].trim())) bulletIndexes.push(i)
    }

    if (bulletIndexes.length < 2) {
      lines.splice(blockEnd, 0, '- Delivered end-to-end implementation with clear technical ownership and measurable outcomes.')
      blockEnd += 1
    } else if (bulletIndexes.length > 3) {
      const extras = bulletIndexes.slice(3).sort((a, b) => b - a)
      for (const removeAt of extras) {
        lines.splice(removeAt, 1)
        blockEnd -= 1
      }
    }

    index = blockEnd
  }
  return lines.join('\n')
}

const buildSourceSectionBlueprint = (blocks: Map<string, string[]>, requiredKeys: string[]): string => {
  const keys = requiredKeys.length ? requiredKeys : Array.from(blocks.keys())
  if (!keys.length) return '[no sections detected]'
  return keys
    .map((key) => {
      const heading = SECTION_HEADING_MAP[key] || key.toUpperCase()
      const lineCount = Math.max(0, (blocks.get(key)?.length || 1) - 1)
      return `- ${heading} (${lineCount} source lines)`
    })
    .join('\n')
}

const extractHeaderLinesFromSource = (resumeText: string): string[] => {
  const lines = String(resumeText || '').replace(/\r/g, '\n').split('\n')
  const header: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (isKnownSectionHeadingLine(line)) break
    header.push(line)
    if (header.length >= 2) break
  }
  return header
}

type ParsedGeneratedBlocks = {
  headerLines: string[]
  blocks: Map<string, string[][]>
}

const parseGeneratedBlocks = (markdown: string): ParsedGeneratedBlocks => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  const blocks = new Map<string, string[][]>()

  let firstSectionIndex = lines.findIndex((line) => isKnownSectionHeadingLine(line.trim()))
  if (firstSectionIndex < 0) firstSectionIndex = lines.length
  const headerLines = lines
    .slice(0, firstSectionIndex)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)

  let index = firstSectionIndex
  while (index < lines.length) {
    const raw = lines[index]?.trim() || ''
    if (!raw || !isKnownSectionHeadingLine(raw)) {
      index += 1
      continue
    }
    const key = normalizeSectionKey(raw)
    if (!KNOWN_SECTION_KEYS.has(key)) {
      index += 1
      continue
    }
    const content: string[] = []
    let cursor = index + 1
    while (cursor < lines.length) {
      const next = lines[cursor]?.trim() || ''
      if (next && isKnownSectionHeadingLine(next)) break
      if (next) content.push(next)
      cursor += 1
    }
    const current = blocks.get(key) || []
    current.push(content)
    blocks.set(key, current)
    index = cursor
  }

  return { headerLines, blocks }
}

const chooseBestBlockContent = (variants: string[][], fallback: string[]): string[] => {
  const scored = variants
    .map((content) => ({
      content,
      score: content.join(' ').length + content.length * 25,
    }))
    .sort((a, b) => b.score - a.score)
  if (scored.length && scored[0].score > 0) return scored[0].content
  return fallback
}

const enforceStrictSectionLayout = (generated: string, resumeText: string, requiredKeys: string[]): string => {
  const sourceBlocks = extractSourceSectionBlocks(resumeText)
  const parsedGenerated = parseGeneratedBlocks(generated)
  const sourceHeader = extractHeaderLinesFromSource(resumeText)

  const nameCandidateRaw = parsedGenerated.headerLines[0] || sourceHeader[0] || 'CANDIDATE NAME'
  const nameCandidate = nameCandidateRaw
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  const contactCandidate = (parsedGenerated.headerLines[1] || sourceHeader[1] || '').trim()

  const keys = requiredKeys.length ? requiredKeys : Array.from(sourceBlocks.keys()).filter((key) => KNOWN_SECTION_KEYS.has(key))
  if (!keys.length) {
    // Safety fallback: if source parsing fails, never collapse response.
    return String(generated || '').trim()
  }
  const output: string[] = []
  output.push(`# ${nameCandidate.toUpperCase()}`)
  if (contactCandidate) output.push(contactCandidate)

  let emittedSections = 0
  for (const key of keys) {
    const heading = SECTION_HEADING_MAP[key] || key.toUpperCase()
    const sourceContent = (sourceBlocks.get(key) || []).slice(1)
    const generatedVariants = parsedGenerated.blocks.get(key) || []
    const content = chooseBestBlockContent(generatedVariants, sourceContent)
    if (!content.length) continue
    output.push(`## ${heading}`)
    output.push(...content)
    emittedSections += 1
  }

  if (emittedSections === 0) {
    // Safety fallback: keep model output if strict merge produced nothing.
    return String(generated || '').trim()
  }

  return output.join('\n').trim()
}

const countCoveredRequiredSections = (markdown: string, requiredKeys: string[]): number => {
  const present = new Set(extractSectionKeysFromText(markdown))
  return requiredKeys.reduce((sum, key) => (present.has(key) ? sum + 1 : sum), 0)
}

const extractSectionOrderFromResume = (resumeText: string): string[] => {
  const lines = String(resumeText || '').replace(/\r/g, '\n').split('\n')
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/@|\||https?:\/\//i.test(line)) continue
    if (!isKnownSectionHeadingLine(line)) continue
    const headingCandidate = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\*\*(.+)\*\*$/, '$1')
      .replace(/\*\*/g, '')
      .trim()
    const key = normalizeSectionKey(headingCandidate)
    if (!key || seen.has(key)) continue
    seen.add(key)
    ordered.push(key)
  }
  return ordered
}

const fetchWithTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const callOpenAI = async (apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> => {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })
  if (!response.ok) throw new Error(`OpenAI error ${response.status}`)
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return toStringValue(payload.choices?.[0]?.message?.content || '')
}

const callClaude = async (apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> => {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })
  if (!response.ok) throw new Error(`Claude error ${response.status}`)
  const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> }
  return toStringValue(payload.content?.find((item) => item.type === 'text')?.text || '')
}

const callGemini = async (apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.2 },
    }),
  })
  if (!response.ok) throw new Error(`Gemini error ${response.status}`)
  const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  return toStringValue(payload.candidates?.[0]?.content?.parts?.[0]?.text || '')
}

const SYSTEM_PROMPT = `
You are a senior recruiter and ATS optimization expert.
Rewrite resumes to maximize interview conversion while remaining fully truthful to candidate evidence.

Non-negotiable output contract:
- Return markdown only. No commentary. No code fences.
- Keep source section order exactly as provided.
- Include each required source section exactly once. Never duplicate a section.
- Never omit PROJECT EXPERIENCE when it exists in source sections.
- Preserve source list style (bullets stay bullets, numbered lists stay numbered).
- Do not invent experience, dates, metrics, titles, or employers.
- Do not use markdown bold markers ("**").
- Use normal hyphen "-" only.

Formatting contract:
- First line: "# FULL NAME" (name only).
- Section headers: "## <section>".
- Role/project title lines: "### <title>".
- No blank line between a section header and first content line.
- TECHNICAL SKILLS must be plain text lines (no bullets).
- Use markdown links for LinkedIn/GitHub/Portfolio and project links when available.

Quality rules:
- Prefer strong action verbs and quantified impact.
- Keep wording concise and ATS friendly.
- Keep one-page equivalent by compressing low-value wording, not by dropping required sections.
`.trim()

const DEFAULT_ATS_PROMPT = `Rewrite my resume to match the job description with strong ATS alignment.
Keep all source sections in source order, once each, with no missing sections and no duplicates.
Stay fully truthful to my resume evidence.
Use concise, impact-focused bullets for experience and projects.
Keep TECHNICAL SKILLS as plain text lines (no bullets).
Use clean markdown links for LinkedIn/GitHub/Portfolio and project links.
No markdown bold markers. No em dash. Use normal hyphen only.`

const trimModelOutput = (text: string): string => {
  const raw = toStringValue(text)
  if (!raw) return ''
  return raw
    .replace(/^```(?:markdown)?/i, '')
    .replace(/```$/i, '')
    .replace(/[\u2013\u2014]/g, '-')
    .trim()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isSupabaseConfigured()) return res.status(500).json({ error: 'Supabase env is not configured' })

  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const body = (req.body || {}) as GenerateBody
  const jobDescription = String(body.jobDescription || '').slice(0, 80_000)
  const templateMarkdown = String(body.templateMarkdown || '').slice(0, 120_000)
  const promptA = String(body.promptA || DEFAULT_ATS_PROMPT).slice(0, 12_000)
  const resumeOverride = String(body.resumeText || '').slice(0, 120_000)

  if (!jobDescription.trim()) {
    return res.status(400).json({ error: 'Job description is required.' })
  }

  const supabase = getSupabaseAdmin()
  const { data: settings, error: settingsError } = await supabase
    .from('user_settings')
    .select('llm_provider,llm_api_key,llm_model')
    .eq('user_id', user.id)
    .maybeSingle()
  if (settingsError) return res.status(500).json({ error: settingsError.message })
  if (!settings) return res.status(400).json({ error: 'User settings not found.' })

  const llmValidationError = validateLlmProviderModelAndKey({
    provider: settings.llm_provider,
    model: settings.llm_model,
    apiKey: settings.llm_api_key,
  })
  if (llmValidationError) {
    return res.status(400).json({ error: llmValidationError })
  }

  const { data: profileData, error: profileError } = await supabase
    .from('user_profile_data')
    .select('resume_text,personal_input')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profileError) return res.status(500).json({ error: profileError.message })

  const resumeText = (resumeOverride || String(profileData?.resume_text || '')).slice(0, 120_000)
  const personalInput = String(profileData?.personal_input || '').slice(0, 80_000)
  const sourceSectionOrder = extractSectionOrderFromResume(resumeText)
  const sourceBlocks = extractSourceSectionBlocks(resumeText)
  const requiredFromOrder = sourceSectionOrder.filter((key) => KNOWN_SECTION_KEYS.has(key))
  const requiredSectionKeys = (requiredFromOrder.length ? requiredFromOrder : Array.from(sourceBlocks.keys())).filter((key) =>
    KNOWN_SECTION_KEYS.has(key),
  )
  const sourceSectionBlueprint = buildSourceSectionBlueprint(sourceBlocks, requiredSectionKeys)

  if (!resumeText.trim()) {
    return res.status(400).json({ error: 'Resume text is required. Upload resume or paste text first.' })
  }

  const userPrompt = [
    'Build a tailored resume from the provided inputs.',
    'If a template is provided, use it as the primary format baseline and override default formatting preferences.',
    '',
    'NON-NEGOTIABLE OUTPUT CONTRACT:',
    '- Use the required section list below in exact order, each section exactly once.',
    '- Do not omit sections and do not duplicate sections.',
    '- Preserve source list style.',
    '- Prompt A is preference only and cannot override required section coverage/ordering.',
    '',
    'Candidate Resume Text:',
    resumeText,
    '',
    'Source Resume Section Order (follow exactly when possible):',
    sourceSectionOrder.length ? sourceSectionOrder.join(' -> ') : '[not detected]',
    '',
    'Required Source Sections (must all appear exactly once):',
    requiredSectionKeys.length ? requiredSectionKeys.map((key) => SECTION_HEADING_MAP[key] || key.toUpperCase()).join(' -> ') : '[none]',
    '',
    'Source Section Blueprint:',
    sourceSectionBlueprint,
    '',
    'Additional Candidate Notes:',
    personalInput || '[none]',
    '',
    'Target Job Description:',
    jobDescription,
    '',
    'Preferred Format Template (Optional):',
    templateMarkdown || '[none]',
    '',
    'Prompt A:',
    promptA || '[none]',
  ].join('\n')

  try {
    const provider = toStringValue(settings.llm_provider).toLowerCase()
    const apiKey = toStringValue(settings.llm_api_key)
    const model = toStringValue(settings.llm_model)
    const raw =
      provider === 'openai'
        ? await callOpenAI(apiKey, model, SYSTEM_PROMPT, userPrompt)
        : provider === 'claude'
          ? await callClaude(apiKey, model, SYSTEM_PROMPT, userPrompt)
          : await callGemini(apiKey, model, SYSTEM_PROMPT, userPrompt)

    let markdown = trimModelOutput(raw)
    if (!markdown) {
      return res.status(502).json({ error: 'LLM returned an empty response.' })
    }

    const missingAfterFirst = requiredSectionKeys.filter((key) => !extractSectionKeysFromText(markdown).includes(key))
    const looksThin = markdown.length < 900
    if (missingAfterFirst.length > 0 || looksThin) {
      const retryPrompt = [
        userPrompt,
        '',
        'IMPORTANT RETRY RULES:',
        '- Your previous output missed required sections or was incomplete.',
        `- Required sections to include: ${requiredSectionKeys.join(', ') || 'summary, experience, projects, skills, education'}.`,
        '- Return a complete resume from start to end in one response.',
        '- Do not omit PROJECT EXPERIENCE if present in source resume.',
      ].join('\n')

      const retryRaw =
        provider === 'openai'
          ? await callOpenAI(apiKey, model, SYSTEM_PROMPT, retryPrompt)
          : provider === 'claude'
            ? await callClaude(apiKey, model, SYSTEM_PROMPT, retryPrompt)
            : await callGemini(apiKey, model, SYSTEM_PROMPT, retryPrompt)
      const retryMarkdown = trimModelOutput(retryRaw)
      if (retryMarkdown) {
        const firstScore = countCoveredRequiredSections(markdown, requiredSectionKeys)
        const retryScore = countCoveredRequiredSections(retryMarkdown, requiredSectionKeys)
        if (retryScore > firstScore || (retryScore === firstScore && retryMarkdown.length > markdown.length)) {
          markdown = retryMarkdown
        }
      }
    }

    markdown = ensureRequiredSectionsFromSource(markdown, resumeText, requiredSectionKeys)
    markdown = removeDuplicateKnownSectionBlocks(markdown)
    markdown = dedupeEducationSectionLines(markdown)
    markdown = enforceStrictSectionLayout(markdown, resumeText, requiredSectionKeys)
    markdown = ensureEducationDegreeLineFromSource(markdown, resumeText)
    markdown = removeRedundantEducationMetaBullets(markdown)
    markdown = ensureEducationSectionFromSourceExact(markdown, resumeText)
    markdown = preserveProjectHyperlinksFromSource(markdown, resumeText)
    markdown = normalizeRoleAndProjectTitleCasing(markdown)
    markdown = normalizeEducationLineCasing(markdown)
    markdown = ensureProjectBulletsTwoToThree(markdown)

    return res.status(200).json({
      ok: true,
      markdown,
      provider,
      model,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate tailored resume',
    })
  }
}
