const STORAGE_KEYS = {
  token: 'ext_auth_token',
  apiBase: 'ext_api_base',
}

const DEFAULT_API_BASE = 'https://jobsync-alpha.vercel.app'
const DEFAULT_MODEL_BY_PROVIDER = {
  openai: 'gpt-5.4-mini',
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-3.1-pro-preview',
}
const MODEL_OPTIONS_BY_PROVIDER = {
  openai: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-4.1'],
  claude: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash'],
}

const state = {
  apiBase: DEFAULT_API_BASE,
  token: '',
  authMode: 'login',
  loading: true,
  authLoading: false,
  authenticated: false,
  user: null,
  llm: { llmProvider: 'openai', llmApiKey: '', llmModel: '' },
  llmModelSelection: '',
  llmCustomModel: '',
  draft: {
    resumeFileName: '',
    resumeText: '',
    jobDescription: '',
    generatedMarkdown: '',
    atsPrompt: '',
    templateMarkdown: '',
    selectedFont: 'Calibri',
    downloadFileName: '',
  },
  message: '',
  messageType: 'muted',
  generating: false,
  savingDraft: false,
  savingLlm: false,
  downloading: '',
  collapseJobDescription: false,
  collapseGeneratedText: false,
  showProfile: false,
}

let autosaveTimer = null

const $app = document.getElementById('app')

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const getModelOptions = (provider) => MODEL_OPTIONS_BY_PROVIDER[provider] || []

const syncModelStateForProvider = (provider, model) => {
  const options = getModelOptions(provider)
  const fallback = DEFAULT_MODEL_BY_PROVIDER[provider] || ''
  const nextModel = String(model || '').trim() || fallback
  const isKnown = options.includes(nextModel)
  state.llm.llmProvider = provider
  state.llm.llmModel = nextModel
  state.llmModelSelection = isKnown ? nextModel : '__custom__'
  state.llmCustomModel = isKnown ? '' : nextModel
}

const toDownloadStem = (value) =>
  String(value || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'tailored_resume'

const escapeAttribute = (value) => escapeHtml(value).replace(/"/g, '&quot;')

const inlineToHtml = (value) => {
  const text = String(value || '')
  const tokenRegex = /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)]+)\)|\*\*([^*]+)\*\*/g
  let html = ''
  let cursor = 0
  let match
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > cursor) html += escapeHtml(text.slice(cursor, match.index))
    if (match[1] && match[2]) {
      html += `<a href="${escapeAttribute(match[2])}" target="_blank" rel="noreferrer">${escapeHtml(match[1])}</a>`
    } else if (match[3]) {
      html += `<strong>${escapeHtml(match[3])}</strong>`
    }
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) html += escapeHtml(text.slice(cursor))
  return html
}

const markdownToPreviewHtml = (markdown) => {
  const lines = String(markdown || '').replace(/\r/g, '\n').split('\n')
  let html = ''
  let inList = false
  let inOrderedList = false

  const closeLists = () => {
    if (inList) {
      html += '</ul>'
      inList = false
    }
    if (inOrderedList) {
      html += '</ol>'
      inOrderedList = false
    }
  }

  lines.forEach((raw) => {
    const line = raw.trim()
    if (!line) {
      closeLists()
      return
    }
    const h3 = line.match(/^###\s+(.+)/)
    if (h3) {
      closeLists()
      html += `<h3>${inlineToHtml(h3[1])}</h3>`
      return
    }
    const h2 = line.match(/^##\s+(.+)/)
    if (h2) {
      closeLists()
      html += `<h2>${inlineToHtml(h2[1])}</h2>`
      return
    }
    const h1 = line.match(/^#\s+(.+)/)
    if (h1) {
      closeLists()
      html += `<h1>${inlineToHtml(h1[1])}</h1>`
      return
    }
    const ordered = line.match(/^(\d+)[.)]\s+(.+)/)
    if (ordered) {
      if (inList) {
        html += '</ul>'
        inList = false
      }
      if (!inOrderedList) {
        html += '<ol>'
        inOrderedList = true
      }
      html += `<li>${inlineToHtml(ordered[2])}</li>`
      return
    }
    const bullet = line.match(/^[-*\u2022]\s+(.+)/)
    if (bullet) {
      if (inOrderedList) {
        html += '</ol>'
        inOrderedList = false
      }
      if (!inList) {
        html += '<ul>'
        inList = true
      }
      html += `<li>${inlineToHtml(bullet[1])}</li>`
      return
    }
    closeLists()
    html += `<p>${inlineToHtml(line)}</p>`
  })
  closeLists()
  return html
}

const setMessage = (text, type = 'muted') => {
  state.message = text
  state.messageType = type
  render()
}

const saveStorage = async (key, value) => chrome.storage.local.set({ [key]: value })
const getStorage = async (key) => {
  const value = await chrome.storage.local.get(key)
  return value[key]
}

const getAuthHeaders = () => {
  const headers = { 'Content-Type': 'application/json' }
  if (state.token) headers.Authorization = `Bearer ${state.token}`
  return headers
}

const apiFetch = async (path, options = {}) => {
  const url = `${state.apiBase.replace(/\/$/, '')}${path}`
  const response = await fetch(url, options)
  let payload = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }
  if (!response.ok) {
    const error = new Error(payload.error || payload.message || `Request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return payload
}

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })

const ensureSession = async () => {
  if (!state.token) return false
  try {
    const payload = await apiFetch('/api/ext/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${state.token}` },
    })
    state.authenticated = Boolean(payload.authenticated)
    state.user = payload.user || null
    return state.authenticated
  } catch {
    state.authenticated = false
    state.user = null
    return false
  }
}

const loadDraft = async () => {
  const payload = await apiFetch('/api/ext/resume/draft', {
    method: 'GET',
    headers: { Authorization: `Bearer ${state.token}` },
  })
  state.draft.resumeFileName = payload.resumeFileName || ''
  state.draft.resumeText = payload.resumeText || ''
  state.draft.jobDescription = payload.jobDescription || ''
  state.draft.generatedMarkdown = payload.generatedMarkdown || ''
  state.draft.atsPrompt = payload.atsPrompt || ''
  state.draft.templateMarkdown = payload.templateMarkdown || ''
  state.draft.selectedFont = payload.selectedFont || 'Calibri'
  state.draft.downloadFileName = payload.downloadFileName || toDownloadStem(payload.resumeFileName || state.draft.resumeFileName || '')
}

const loadLlm = async () => {
  const payload = await apiFetch('/api/ext/settings/llm', {
    method: 'GET',
    headers: { Authorization: `Bearer ${state.token}` },
  })
  state.llm.llmProvider = payload.llmProvider || 'openai'
  state.llm.llmApiKey = payload.llmApiKey || ''
  syncModelStateForProvider(state.llm.llmProvider, payload.llmModel || '')
}

const refreshWorkspace = async () => {
  await Promise.all([loadDraft(), loadLlm()])
}

const saveDraft = async () => {
  if (!state.authenticated) return
  state.savingDraft = true
  render()
  try {
    await apiFetch('/api/ext/resume/draft', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        resumeText: state.draft.resumeText,
        jobDescription: state.draft.jobDescription,
        generatedMarkdown: state.draft.generatedMarkdown,
        atsPrompt: state.draft.atsPrompt,
        templateMarkdown: state.draft.templateMarkdown,
        selectedFont: state.draft.selectedFont,
        downloadFileName: toDownloadStem(state.draft.downloadFileName || state.draft.resumeFileName),
      }),
    })
  } catch (error) {
    setMessage(error.message || 'Failed to autosave draft', 'error')
  } finally {
    state.savingDraft = false
    render()
  }
}

const scheduleAutosave = () => {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    void saveDraft()
  }, 700)
}

const handleGenerate = async () => {
  if (!state.draft.resumeText.trim()) return setMessage('Please upload a resume first.', 'error')
  if (!state.draft.jobDescription.trim()) return setMessage('Please paste job description.', 'error')

  state.generating = true
  setMessage('Generating resume...', 'muted')
  try {
    const payload = await apiFetch('/api/ext/resume/generate', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        resumeText: state.draft.resumeText,
        jobDescription: state.draft.jobDescription,
        atsPrompt: state.draft.atsPrompt,
        templateMarkdown: state.draft.templateMarkdown,
      }),
    })
    state.draft.generatedMarkdown = payload.markdown || ''
    render()
    await saveDraft()
    setMessage('Generated tailored resume.', 'success')
  } catch (error) {
    setMessage(error.message || 'Failed to generate resume', 'error')
  } finally {
    state.generating = false
    render()
  }
}

const handleResumeUpload = async (file) => {
  if (!file) return
  const lower = file.name.toLowerCase()
  if (!lower.endsWith('.pdf') && !lower.endsWith('.docx')) {
    return setMessage('Only PDF or DOCX files are supported.', 'error')
  }

  try {
    const dataUrl = await readFileAsDataUrl(file)
    const payload = await apiFetch('/api/ext/resume/upload', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, dataUrl }),
    })
    state.draft.resumeFileName = payload.fileName || file.name
    state.draft.resumeText = payload.extractedText || state.draft.resumeText
    state.draft.generatedMarkdown = ''
    state.draft.downloadFileName = toDownloadStem(payload.fileName || file.name)
    render()
    await saveDraft()
    setMessage('Resume uploaded and extracted.', 'success')
  } catch (error) {
    setMessage(error.message || 'Failed to upload resume', 'error')
  }
}

const downloadBlob = (blob, fileName) => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

const fetchExportBlob = async (path, payload) => {
  const response = await fetch(`${state.apiBase.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const json = await response.json()
      message = json.error || json.message || message
    } catch {
      // noop
    }
    throw new Error(message)
  }
  return response.blob()
}

const handleDownloadDocx = async () => {
  if (!state.draft.generatedMarkdown.trim()) return setMessage('Generate resume first.', 'error')
  state.downloading = 'docx'
  render()
  try {
    const fileStem = toDownloadStem(state.draft.downloadFileName || state.draft.resumeFileName)
    const blob = await fetchExportBlob('/api/ext/resume/export-docx', {
      markdown: state.draft.generatedMarkdown,
      selectedFont: state.draft.selectedFont,
      fileName: fileStem,
    })
    downloadBlob(blob, `${fileStem}.docx`)
    setMessage('DOCX downloaded.', 'success')
  } catch (error) {
    setMessage(error.message || 'Failed to download DOCX', 'error')
  } finally {
    state.downloading = ''
    render()
  }
}

const handleDownloadPdf = async () => {
  if (!state.draft.generatedMarkdown.trim()) return setMessage('Generate resume first.', 'error')
  state.downloading = 'pdf'
  render()
  try {
    const fileStem = toDownloadStem(state.draft.downloadFileName || state.draft.resumeFileName)
    const blob = await fetchExportBlob('/api/ext/resume/export-pdf', {
      markdown: state.draft.generatedMarkdown,
      selectedFont: state.draft.selectedFont,
      fileName: fileStem,
    })
    downloadBlob(blob, `${fileStem}.pdf`)
    setMessage('PDF downloaded.', 'success')
  } catch (error) {
    setMessage(error.message || 'Failed to download PDF', 'error')
  } finally {
    state.downloading = ''
    render()
  }
}

const handleAuthSubmit = async (event) => {
  event.preventDefault()
  if (state.authLoading) return
  const form = event.currentTarget
  const formData = new FormData(form)

  const payload = {
    email: String(formData.get('email') || '').trim(),
    username: String(formData.get('username') || '').trim(),
    fullName: String(formData.get('fullName') || '').trim(),
    password: String(formData.get('password') || ''),
  }

  state.authLoading = true
  render()

  try {
    if (state.authMode === 'register') {
      const result = await apiFetch('/api/ext/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      state.authMode = 'login'
      setMessage(result.message || 'Account created. Verify email, then sign in.', 'success')
    } else {
      const result = await apiFetch('/api/ext/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: payload.username || payload.email, password: payload.password }),
      })
      state.token = String(result.token || '')
      await saveStorage(STORAGE_KEYS.token, state.token)
      await ensureSession()
      await refreshWorkspace()
      setMessage('Signed in successfully.', 'success')
    }
  } catch (error) {
    setMessage(error.message || 'Authentication failed', 'error')
  } finally {
    state.authLoading = false
    render()
  }
}

const handleSaveLlm = async () => {
  const provider = String(state.llm.llmProvider || 'openai').toLowerCase()
  const options = getModelOptions(provider)
  const effectiveSelection = state.llmModelSelection || (options.includes(state.llm.llmModel) ? state.llm.llmModel : '__custom__')
  if (effectiveSelection === '__custom__') {
    state.llm.llmModel = String(state.llmCustomModel || '').trim()
  } else if (options.includes(effectiveSelection)) {
    state.llm.llmModel = effectiveSelection
  } else {
    state.llm.llmModel = DEFAULT_MODEL_BY_PROVIDER[provider] || ''
  }
  if (!state.llm.llmModel) return setMessage('Please choose or enter an LLM model.', 'error')

  state.savingLlm = true
  render()
  try {
    await apiFetch('/api/ext/settings/llm', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(state.llm),
    })
    setMessage('LLM settings updated.', 'success')
  } catch (error) {
    setMessage(error.message || 'Failed to save LLM settings', 'error')
  } finally {
    state.savingLlm = false
    render()
  }
}

const handleLogout = async () => {
  try {
    await apiFetch('/api/ext/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
    })
  } catch {
    // noop
  }
  state.token = ''
  state.authenticated = false
  state.user = null
  state.showProfile = false
  await saveStorage(STORAGE_KEYS.token, '')
  setMessage('Logged out.', 'muted')
  render()
}

const renderAuthView = () => {
  const isLogin = state.authMode === 'login'
  return `
    <div class="app-shell">
      <section class="card">
        <div class="header">
          <div>
            <h1 class="title">Resume Assistant</h1>
            <p class="kicker">Chrome Side Panel</p>
          </div>
        </div>
      </section>
      <section class="card">
        <div class="auth-tabs">
          <button class="btn auth-tab ${isLogin ? 'active' : ''}" data-action="switch-auth" data-mode="login">Login</button>
          <button class="btn auth-tab ${!isLogin ? 'active' : ''}" data-action="switch-auth" data-mode="register">Create Account</button>
        </div>
        <form id="auth-form" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
          ${!isLogin ? '<input class="input" name="fullName" placeholder="Full name" />' : ''}
          ${!isLogin ? '<input class="input" name="email" placeholder="Email" type="email" required />' : ''}
          <input class="input" name="username" placeholder="${isLogin ? 'Username or email' : 'Username'}" required />
          <input class="input" name="password" placeholder="Password" type="password" required />
          <button class="btn primary" type="submit" ${state.authLoading ? 'disabled' : ''}>${state.authLoading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}</button>
        </form>
      </section>
      <section class="card">
        <p class="label">API Base</p>
        <input id="api-base-input" class="input" value="${escapeHtml(state.apiBase)}" />
        <div class="footer-actions" style="margin-top:8px;">
          <button class="btn" data-action="save-api-base">Save Endpoint</button>
        </div>
      </section>
      ${state.message ? `<section class="card"><p class="message ${state.messageType === 'error' ? 'error' : state.messageType === 'success' ? 'success' : ''}">${escapeHtml(state.message)}</p></section>` : ''}
    </div>
  `
}

const renderProfileDrawer = () => {
  if (!state.showProfile || !state.user) return ''
  const provider = String(state.llm.llmProvider || 'openai').toLowerCase()
  const options = getModelOptions(provider)
  const modelSelection = state.llmModelSelection || (options.includes(state.llm.llmModel) ? state.llm.llmModel : '__custom__')
  const showCustomModel = modelSelection === '__custom__'
  const modelOptionHtml = options
    .map((model) => `<option value="${escapeHtml(model)}" ${modelSelection === model ? 'selected' : ''}>${escapeHtml(model)}</option>`)
    .join('')

  return `
    <div class="backdrop" data-action="close-profile"></div>
    <aside class="drawer">
      <div class="header">
        <h2 class="title">Profile & Settings</h2>
        <button class="icon-btn" data-action="close-profile">Close</button>
      </div>
      <section class="card" style="margin-top:10px;">
        <p class="label">Name</p>
        <p class="message">${escapeHtml(state.user.fullName || state.user.username)}</p>
        <p class="label" style="margin-top:8px;">Email</p>
        <p class="message">${escapeHtml(state.user.email)}</p>
      </section>
      <section class="card" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
        <p class="label">LLM Provider</p>
        <select id="llm-provider" class="select">
          <option value="openai" ${provider === 'openai' ? 'selected' : ''}>OpenAI</option>
          <option value="claude" ${provider === 'claude' ? 'selected' : ''}>Claude</option>
          <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>Gemini</option>
        </select>
        <p class="label">LLM API Key</p>
        <input id="llm-api-key" class="input" type="password" value="${escapeHtml(state.llm.llmApiKey)}" placeholder="Enter API key" />
        <p class="label">LLM Model</p>
        <select id="llm-model-select" class="select">
          ${modelOptionHtml}
          <option value="__custom__" ${showCustomModel ? 'selected' : ''}>Custom model...</option>
        </select>
        ${showCustomModel ? `<input id="llm-model-custom" class="input" value="${escapeHtml(state.llmCustomModel || state.llm.llmModel)}" placeholder="Enter custom model" />` : ''}
        <button class="btn primary" data-action="save-llm" ${state.savingLlm ? 'disabled' : ''}>${state.savingLlm ? 'Saving...' : 'Save LLM Settings'}</button>
      </section>
      <section class="card" style="margin-top:10px;">
        <button class="btn" data-action="logout">Logout</button>
      </section>
    </aside>
  `
}

const renderAssistantView = () => {
  const userInitial = escapeHtml((state.user?.fullName || state.user?.username || 'U').charAt(0).toUpperCase())
  const previewHtml = markdownToPreviewHtml(state.draft.generatedMarkdown)
  return `
    <div class="app-shell">
      <div class="assistant-topbar">
        <div class="assistant-brand">
          <img src="./assets/dragon-logo.png" alt="Logo" class="assistant-logo" onerror="this.style.display='none'" />
          <h1 class="title">Resume Assistant</h1>
        </div>
        <button class="profile-avatar-btn" data-action="open-profile" title="Profile">${userInitial}</button>
      </div>

      <section class="card" style="display:flex;flex-direction:column;gap:8px;">
        <p class="label">Upload Resume (PDF/DOCX)</p>
        <div class="file-row">
          <button class="btn primary" data-action="pick-resume">Choose File</button>
          <input id="resume-file-input" class="hidden" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          <span class="file-name">${escapeHtml(state.draft.resumeFileName || 'No file chosen')}</span>
        </div>

        <div class="textarea-box ${state.collapseJobDescription ? 'collapsed' : ''}">
          <div class="textarea-box-header">
            <p class="label">Job Description</p>
            <button class="textarea-collapse-btn" data-action="toggle-job-description" title="${state.collapseJobDescription ? 'Show' : 'Hide'}">
              <span class="collapse-btn-label">${state.collapseJobDescription ? 'Show' : 'Hide'}</span>
              <span class="collapse-btn-caret">${state.collapseJobDescription ? '&#9662;' : '&#9652;'}</span>
            </button>
          </div>
          ${state.collapseJobDescription ? '' : `<textarea id="job-description" class="textarea">${escapeHtml(state.draft.jobDescription)}</textarea>`}
        </div>

        <div class="footer-actions">
          <button class="btn primary" data-action="generate" ${state.generating ? 'disabled' : ''}>${state.generating ? 'Generating...' : 'Generate Resume'}</button>
          <button class="btn" data-action="save-draft">${state.savingDraft ? 'Saving...' : 'Save Draft'}</button>
        </div>
      </section>

      <section class="card">
        <div class="generated-toolbar">
          <p class="label">Generated Resume</p>
          <div class="generated-actions">
            <select id="selected-font" class="select small">
              <option value="Calibri" ${state.draft.selectedFont === 'Calibri' ? 'selected' : ''}>Calibri</option>
              <option value="Arial" ${state.draft.selectedFont === 'Arial' ? 'selected' : ''}>Arial</option>
              <option value="Times New Roman" ${state.draft.selectedFont === 'Times New Roman' ? 'selected' : ''}>Times New Roman</option>
              <option value="Roboto" ${state.draft.selectedFont === 'Roboto' ? 'selected' : ''}>Roboto</option>
              <option value="Garamond" ${state.draft.selectedFont === 'Garamond' ? 'selected' : ''}>Garamond</option>
            </select>
            <button class="btn" data-action="download-docx" ${!state.draft.generatedMarkdown || state.downloading === 'docx' ? 'disabled' : ''}>${state.downloading === 'docx' ? 'Preparing DOCX...' : 'Download DOCX'}</button>
            <button class="btn" data-action="download-pdf" ${!state.draft.generatedMarkdown || state.downloading === 'pdf' ? 'disabled' : ''}>${state.downloading === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}</button>
          </div>
        </div>
        <p class="label">Resume File Name</p>
        <input id="download-file-name" class="input" value="${escapeHtml(state.draft.downloadFileName || '')}" placeholder="resume_file_name" />
        <div class="textarea-box ${state.collapseGeneratedText ? 'collapsed' : ''} mt-8">
          <div class="textarea-box-header">
            <p class="label">Generated Resume Text</p>
            <button class="textarea-collapse-btn" data-action="toggle-generated-text" title="${state.collapseGeneratedText ? 'Show' : 'Hide'}">
              <span class="collapse-btn-label">${state.collapseGeneratedText ? 'Show' : 'Hide'}</span>
              <span class="collapse-btn-caret">${state.collapseGeneratedText ? '&#9662;' : '&#9652;'}</span>
            </button>
          </div>
          ${state.collapseGeneratedText ? '' : `<textarea id="generated-markdown" class="textarea generated">${escapeHtml(state.draft.generatedMarkdown)}</textarea>`}
        </div>
        <p class="label mt-8">Preview</p>
        <div class="preview-frame resume-font-${escapeHtml(state.draft.selectedFont.toLowerCase().replace(/\s+/g, '-'))}">
          <div class="preview-page">${previewHtml || '<p class="message">Generate resume to view preview.</p>'}</div>
        </div>
      </section>

      ${state.message ? `<section class="card"><p class="message ${state.messageType === 'error' ? 'error' : state.messageType === 'success' ? 'success' : ''}">${escapeHtml(state.message)}</p></section>` : ''}
      ${renderProfileDrawer()}
    </div>
  `
}

const bindEvents = () => {
  const authForm = document.getElementById('auth-form')
  if (authForm) authForm.addEventListener('submit', (event) => void handleAuthSubmit(event))

  document.querySelectorAll('[data-action="switch-auth"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.authMode = button.dataset.mode === 'register' ? 'register' : 'login'
      render()
    })
  })

  const apiBaseInput = document.getElementById('api-base-input')
  const saveApiBtn = document.querySelector('[data-action="save-api-base"]')
  if (apiBaseInput && saveApiBtn) {
    saveApiBtn.addEventListener('click', async () => {
      const next = String(apiBaseInput.value || '').trim().replace(/\/$/, '')
      if (!next) return
      state.apiBase = next
      await saveStorage(STORAGE_KEYS.apiBase, next)
      setMessage('API endpoint saved.', 'success')
    })
  }

  const profileOpenBtn = document.querySelector('[data-action="open-profile"]')
  if (profileOpenBtn) profileOpenBtn.addEventListener('click', () => {
    state.showProfile = true
    render()
  })

  document.querySelectorAll('[data-action="close-profile"]').forEach((el) => {
    el.addEventListener('click', () => {
      state.showProfile = false
      render()
    })
  })

  const saveLlmBtn = document.querySelector('[data-action="save-llm"]')
  const providerSelect = document.getElementById('llm-provider')
  const modelSelect = document.getElementById('llm-model-select')
  const customModelInput = document.getElementById('llm-model-custom')

  if (providerSelect) {
    providerSelect.addEventListener('change', () => {
      const provider = String(providerSelect.value || 'openai').toLowerCase()
      syncModelStateForProvider(provider, DEFAULT_MODEL_BY_PROVIDER[provider] || '')
      render()
    })
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      const selected = String(modelSelect.value || '')
      state.llmModelSelection = selected
      if (selected !== '__custom__') {
        state.llm.llmModel = selected
      }
      render()
    })
  }

  if (customModelInput) {
    customModelInput.addEventListener('input', () => {
      const customValue = String(customModelInput.value || '').trim()
      state.llmCustomModel = customValue
      state.llm.llmModel = customValue
    })
  }

  if (saveLlmBtn) {
    saveLlmBtn.addEventListener('click', async () => {
      const apiKey = document.getElementById('llm-api-key')
      state.llm.llmApiKey = apiKey ? apiKey.value : state.llm.llmApiKey
      await handleSaveLlm()
    })
  }

  const logoutBtn = document.querySelector('[data-action="logout"]')
  if (logoutBtn) logoutBtn.addEventListener('click', () => void handleLogout())

  const pickResumeBtn = document.querySelector('[data-action="pick-resume"]')
  const resumeInput = document.getElementById('resume-file-input')
  if (pickResumeBtn && resumeInput) {
    pickResumeBtn.addEventListener('click', () => resumeInput.click())
    resumeInput.addEventListener('change', async () => {
      const file = resumeInput.files && resumeInput.files[0]
      if (!file) return
      await handleResumeUpload(file)
      resumeInput.value = ''
    })
  }

  const toggleJobDescriptionBtn = document.querySelector('[data-action="toggle-job-description"]')
  if (toggleJobDescriptionBtn) {
    toggleJobDescriptionBtn.addEventListener('click', () => {
      state.collapseJobDescription = !state.collapseJobDescription
      render()
    })
  }

  const toggleGeneratedTextBtn = document.querySelector('[data-action="toggle-generated-text"]')
  if (toggleGeneratedTextBtn) {
    toggleGeneratedTextBtn.addEventListener('click', () => {
      state.collapseGeneratedText = !state.collapseGeneratedText
      render()
    })
  }

  const jobDescription = document.getElementById('job-description')
  if (jobDescription) {
    jobDescription.addEventListener('input', () => {
      state.draft.jobDescription = jobDescription.value
      scheduleAutosave()
    })
  }

  const generated = document.getElementById('generated-markdown')
  if (generated) {
    generated.addEventListener('input', () => {
      state.draft.generatedMarkdown = generated.value
      scheduleAutosave()
    })
  }

  const selectedFont = document.getElementById('selected-font')
  if (selectedFont) {
    selectedFont.addEventListener('change', () => {
      state.draft.selectedFont = selectedFont.value || 'Calibri'
      scheduleAutosave()
      render()
    })
  }

  const downloadFileName = document.getElementById('download-file-name')
  if (downloadFileName) {
    downloadFileName.addEventListener('input', () => {
      state.draft.downloadFileName = downloadFileName.value
      scheduleAutosave()
    })
  }

  const generateBtn = document.querySelector('[data-action="generate"]')
  if (generateBtn) generateBtn.addEventListener('click', () => void handleGenerate())

  const saveDraftBtn = document.querySelector('[data-action="save-draft"]')
  if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => void saveDraft())

  const downloadDocxBtn = document.querySelector('[data-action="download-docx"]')
  if (downloadDocxBtn) downloadDocxBtn.addEventListener('click', () => void handleDownloadDocx())

  const downloadPdfBtn = document.querySelector('[data-action="download-pdf"]')
  if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', () => void handleDownloadPdf())
}

const render = () => {
  if (state.loading) {
    $app.innerHTML = '<div class="app-shell"><section class="card"><p class="message">Loading...</p></section></div>'
    return
  }

  $app.innerHTML = state.authenticated ? renderAssistantView() : renderAuthView()
  bindEvents()
}

const bootstrap = async () => {
  state.loading = true
  render()

  const [token, savedBase] = await Promise.all([getStorage(STORAGE_KEYS.token), getStorage(STORAGE_KEYS.apiBase)])
  state.token = String(token || '')
  state.apiBase = String(savedBase || DEFAULT_API_BASE)

  const ok = await ensureSession()
  if (ok) {
    try {
      await refreshWorkspace()
    } catch (error) {
      setMessage(error.message || 'Failed to load profile draft', 'error')
    }
  }

  state.loading = false
  render()
}

void bootstrap()
