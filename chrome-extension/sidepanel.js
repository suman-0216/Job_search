const STORAGE_KEYS = {
  token: 'ext_auth_token',
  apiBase: 'ext_api_base',
}

const DEFAULT_API_BASE = 'https://jobsync-alpha.vercel.app'

const state = {
  apiBase: DEFAULT_API_BASE,
  token: '',
  authMode: 'login',
  loading: true,
  authLoading: false,
  authenticated: false,
  user: null,
  llm: { llmProvider: 'openai', llmApiKey: '', llmModel: '' },
  draft: {
    resumeFileName: '',
    resumeText: '',
    jobDescription: '',
    generatedMarkdown: '',
    atsPrompt: '',
    templateMarkdown: '',
  },
  message: '',
  messageType: 'muted',
  generating: false,
  savingDraft: false,
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
}

const loadLlm = async () => {
  const payload = await apiFetch('/api/ext/settings/llm', {
    method: 'GET',
    headers: { Authorization: `Bearer ${state.token}` },
  })
  state.llm.llmProvider = payload.llmProvider || 'openai'
  state.llm.llmApiKey = payload.llmApiKey || ''
  state.llm.llmModel = payload.llmModel || ''
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
  if (!state.draft.resumeText.trim()) return setMessage('Please upload/paste resume text first.', 'error')
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
    render()
    await saveDraft()
    setMessage('Resume uploaded and extracted.', 'success')
  } catch (error) {
    setMessage(error.message || 'Failed to upload resume', 'error')
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
  try {
    await apiFetch('/api/ext/settings/llm', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(state.llm),
    })
    setMessage('LLM settings updated.', 'success')
  } catch (error) {
    setMessage(error.message || 'Failed to save LLM settings', 'error')
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
          <option value="openai" ${state.llm.llmProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
          <option value="claude" ${state.llm.llmProvider === 'claude' ? 'selected' : ''}>Claude</option>
          <option value="gemini" ${state.llm.llmProvider === 'gemini' ? 'selected' : ''}>Gemini</option>
        </select>
        <p class="label">LLM API Key</p>
        <input id="llm-api-key" class="input" type="password" value="${escapeHtml(state.llm.llmApiKey)}" placeholder="Enter API key" />
        <p class="label">LLM Model</p>
        <input id="llm-model" class="input" value="${escapeHtml(state.llm.llmModel)}" placeholder="Model name" />
        <button class="btn primary" data-action="save-llm">Save LLM Settings</button>
      </section>
      <section class="card" style="margin-top:10px;">
        <button class="btn" data-action="logout">Logout</button>
      </section>
    </aside>
  `
}

const renderAssistantView = () => {
  return `
    <div class="app-shell">
      <section class="card header">
        <div>
          <h1 class="title">Resume Assistant</h1>
          <p class="kicker">Upload resume + paste job description + generate</p>
        </div>
        <button class="icon-btn" data-action="open-profile">Profile</button>
      </section>

      <section class="card" style="display:flex;flex-direction:column;gap:8px;">
        <p class="label">Upload Resume (PDF/DOCX)</p>
        <div class="file-row">
          <button class="btn primary" data-action="pick-resume">Choose File</button>
          <input id="resume-file-input" class="hidden" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          <span class="file-name">${escapeHtml(state.draft.resumeFileName || 'No file chosen')}</span>
        </div>

        <p class="label">Resume Text</p>
        <textarea id="resume-text" class="textarea">${escapeHtml(state.draft.resumeText)}</textarea>

        <p class="label">Job Description</p>
        <textarea id="job-description" class="textarea">${escapeHtml(state.draft.jobDescription)}</textarea>

        <div class="footer-actions">
          <button class="btn primary" data-action="generate" ${state.generating ? 'disabled' : ''}>${state.generating ? 'Generating...' : 'Generate Resume'}</button>
          <button class="btn" data-action="save-draft">${state.savingDraft ? 'Saving...' : 'Save Draft'}</button>
        </div>
      </section>

      <section class="card">
        <p class="label">Generated Card</p>
        <textarea id="generated-markdown" class="textarea generated">${escapeHtml(state.draft.generatedMarkdown)}</textarea>
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
  if (saveLlmBtn) {
    saveLlmBtn.addEventListener('click', async () => {
      const provider = document.getElementById('llm-provider')
      const apiKey = document.getElementById('llm-api-key')
      const model = document.getElementById('llm-model')
      state.llm.llmProvider = provider ? provider.value : state.llm.llmProvider
      state.llm.llmApiKey = apiKey ? apiKey.value : state.llm.llmApiKey
      state.llm.llmModel = model ? model.value : state.llm.llmModel
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

  const resumeText = document.getElementById('resume-text')
  if (resumeText) {
    resumeText.addEventListener('input', () => {
      state.draft.resumeText = resumeText.value
      scheduleAutosave()
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

  const generateBtn = document.querySelector('[data-action="generate"]')
  if (generateBtn) generateBtn.addEventListener('click', () => void handleGenerate())

  const saveDraftBtn = document.querySelector('[data-action="save-draft"]')
  if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => void saveDraft())
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
