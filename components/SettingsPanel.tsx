import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import CustomSelect, { SelectOption } from '../components/CustomSelect'

interface SettingsPanelProps {
  onClose?: () => void
  className?: string
}

interface UserSettings {
  apifyToken: string
  llmProvider: 'openai' | 'claude' | 'gemini'
  llmApiKey: string
  llmModel: string
  workflowEnabled: boolean
  timezone: string
  runTimes: string[]
  targetRoles: string[]
  targetLocations: string[]
  experienceMin: number
  experienceMax: number
  requirements: string
  sourceConfig: {
    linkedin: boolean
    startups: boolean
    funded: boolean
    stealth: boolean
  }
  userData: {
    resumeFileName?: string
    resumeText: string
    personalInput: string
  }
}

const providerOptions: SelectOption[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
]
const CUSTOM_MODEL_VALUE = '__custom_model__'

const modelOptionsByProvider: Record<UserSettings['llmProvider'], SelectOption[]> = {
  openai: [
    { value: 'gpt-5.4', label: 'gpt-5.4' },
    { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
    { value: 'gpt-4.1', label: 'gpt-4.1' },
  ],
  claude: [
    { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
    { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
    { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5-20251001' },
  ],
  gemini: [
    { value: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview' },
    { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
    { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
  ],
}

const defaultSettings: UserSettings = {
  apifyToken: '',
  llmProvider: 'openai',
  llmApiKey: '',
  llmModel: 'gpt-5.4',
  workflowEnabled: true,
  timezone: 'America/Los_Angeles',
  runTimes: ['06:30', '09:00', '12:00'],
  targetRoles: [],
  targetLocations: ['United States', 'California', 'San Francisco Bay Area'],
  experienceMin: 0,
  experienceMax: 3,
  requirements: '',
  sourceConfig: {
    linkedin: true,
    startups: true,
    funded: true,
    stealth: true,
  },
  userData: {
    resumeFileName: '',
    resumeText: '',
    personalInput: '',
  },
}

const normalizeRunTime = (value: string): string | null => {
  const cleaned = value.trim()
  const match = cleaned.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  const hour = match[1].padStart(2, '0')
  const minute = match[2]
  return `${hour}:${minute}`
}

export default function SettingsPanel({ onClose, className }: SettingsPanelProps) {
  const router = useRouter()
  const [settings, setSettings] = useState<UserSettings>(defaultSettings)
  const [customModels, setCustomModels] = useState<Record<UserSettings['llmProvider'], string>>({
    openai: '',
    claude: '',
    gemini: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [hasEdited, setHasEdited] = useState(false)
  const [roleInput, setRoleInput] = useState('')
  const [runTimeInput, setRunTimeInput] = useState('')
  const [locationInput, setLocationInput] = useState('')
  const [showApifyKey, setShowApifyKey] = useState(false)
  const [showLlmApiKey, setShowLlmApiKey] = useState(false)
  const [activeSection, setActiveSection] = useState<'keys' | 'times' | 'targets' | 'requirements' | 'userData'>('keys')
  const [resumeFileName, setResumeFileName] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialHydrationCompleteRef = useRef(false)

  const baseModelOptions = useMemo(() => modelOptionsByProvider[settings.llmProvider], [settings.llmProvider])
  const modelOptions = useMemo(
    () => [...baseModelOptions, { value: CUSTOM_MODEL_VALUE, label: 'Custom model...' }],
    [baseModelOptions]
  )
  const isCustomModelSelected = !baseModelOptions.some((option) => option.value === settings.llmModel)
  const modelSelectValue = isCustomModelSelected ? CUSTOM_MODEL_VALUE : settings.llmModel

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/user/settings')
        if (res.status === 401) {
          await router.push('/login')
          return
        }
        const payload = (await res.json()) as UserSettings
        const merged = { ...defaultSettings, ...payload }
        const providerModels = modelOptionsByProvider[merged.llmProvider] || modelOptionsByProvider.openai
        const nextCustomModels: Record<UserSettings['llmProvider'], string> = { openai: '', claude: '', gemini: '' }
        if (!providerModels.some((item) => item.value === merged.llmModel)) {
          nextCustomModels[merged.llmProvider] = merged.llmModel
        }
        merged.targetRoles = (merged.targetRoles || []).slice(0, 3)
        merged.targetLocations = (merged.targetLocations || []).slice(0, 3)
        merged.runTimes = (merged.runTimes || []).slice(0, 3)
        merged.timezone = 'America/Los_Angeles'
        merged.sourceConfig = {
          linkedin: payload.sourceConfig?.linkedin !== false,
          startups: payload.sourceConfig?.startups !== false,
          funded: payload.sourceConfig?.funded !== false,
          stealth: payload.sourceConfig?.stealth !== false,
        }
        merged.userData = {
          resumeFileName: payload.userData?.resumeFileName || '',
          resumeText: payload.userData?.resumeText || '',
          personalInput: payload.userData?.personalInput || '',
        }
        setResumeFileName(merged.userData.resumeFileName || '')
        setCustomModels(nextCustomModels)
        setSettings(merged)
        setHydrated(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const addRole = () => {
    const value = roleInput.trim()
    if (!value) return
    if (settings.targetRoles.length >= 3) return setMessage('Maximum 3 target roles allowed.')
    if (settings.targetRoles.some((role) => role.toLowerCase() === value.toLowerCase())) return setMessage('Role already added.')
    setSettings((prev) => ({ ...prev, targetRoles: [...prev.targetRoles, value] }))
    setRoleInput('')
    setMessage('')
  }

  const removeRole = (role: string) => {
    setSettings((prev) => ({ ...prev, targetRoles: prev.targetRoles.filter((item) => item !== role) }))
  }

  const addRunTime = () => {
    if (settings.runTimes.length >= 3) return setMessage('Maximum 3 run times allowed.')
    const normalized = normalizeRunTime(runTimeInput)
    if (!normalized) return setMessage('Use run time format HH:MM (24-hour), e.g. 06:30.')
    if (settings.runTimes.includes(normalized)) return setMessage('Run time already added.')
    setSettings((prev) => ({ ...prev, runTimes: [...prev.runTimes, normalized] }))
    setRunTimeInput('')
    setMessage('')
  }

  const removeRunTime = (time: string) => {
    setSettings((prev) => ({ ...prev, runTimes: prev.runTimes.filter((item) => item !== time) }))
  }

  const addLocation = () => {
    const value = locationInput.trim()
    if (!value) return
    if (settings.targetLocations.length >= 3) return setMessage('Maximum 3 locations allowed.')
    if (settings.targetLocations.some((location) => location.toLowerCase() === value.toLowerCase())) return setMessage('Location already added.')
    setSettings((prev) => ({ ...prev, targetLocations: [...prev.targetLocations, value] }))
    setLocationInput('')
    setMessage('')
  }

  const removeLocation = (location: string) => {
    setSettings((prev) => ({ ...prev, targetLocations: prev.targetLocations.filter((item) => item !== location) }))
  }

  const persistSettings = useCallback(async (nextSettings: UserSettings, silent = false) => {
    if (!nextSettings.llmModel.trim()) {
      if (!silent) setMessage('Please choose a model or enter a custom model name.')
      return false
    }
    setSaving(true)
    try {
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...nextSettings,
          timezone: 'America/Los_Angeles',
          targetRoles: nextSettings.targetRoles.slice(0, 3),
          targetLocations: nextSettings.targetLocations.slice(0, 3),
          runTimes: nextSettings.runTimes.slice(0, 3),
        }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        if (!silent) setMessage(payload.error || 'Failed to save settings')
        if (silent) setSaveState('error')
        return false
      }
      if (silent && hasEdited) setSaveState('saved')
      return true
    } catch {
      if (!silent) setMessage('Failed to save settings')
      if (silent) setSaveState('error')
      return false
    } finally {
      setSaving(false)
    }
  }, [hasEdited])

  const validateBeforeTrigger = (value: UserSettings): string | null => {
    if (!value.apifyToken.trim()) return 'Apify key is required before triggering.'
    if (!value.llmApiKey.trim()) return 'LLM API key is required before triggering.'
    if (!value.llmProvider.trim()) return 'LLM provider is required before triggering.'
    if (!value.llmModel.trim()) return 'LLM model is required before triggering.'
    if (!value.runTimes.length) return 'Add at least one run time.'
    if (!value.targetRoles.length) return 'Add at least one target role.'
    if (!value.targetLocations.length) return 'Add at least one target location.'
    if (value.experienceMax < value.experienceMin) return 'Max experience should be greater than or equal to min experience.'
    if (!value.requirements.trim()) return 'Additional requirements are required before triggering.'
    return null
  }

  useEffect(() => {
    if (!hydrated || loading) return
    if (!initialHydrationCompleteRef.current) {
      initialHydrationCompleteRef.current = true
      return
    }
    setHasEdited(true)
    setSaveState('saving')
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      void persistSettings(settings, true)
    }, 900)
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [settings, hydrated, loading, persistSettings])

  const triggerNow = async () => {
    const validationError = validateBeforeTrigger(settings)
    if (validationError) {
      setMessage(validationError)
      return
    }
    const saved = await persistSettings(settings, true)
    if (!saved) {
      setMessage('Could not save latest settings before trigger.')
      return
    }
    setMessage('')
    try {
      const response = await fetch('/api/user/trigger', { method: 'POST' })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        return setMessage(payload.error || 'Failed to queue run')
      }
      setMessage('Run queued for this user.')
    } catch {
      setMessage('Failed to queue run')
    }
  }

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })

  const handleResumeUpload = async (file: File | null) => {
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
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          dataUrl,
        }),
      })
      const payload = (await response.json()) as { error?: string; extractedText?: string }
      if (!response.ok) {
        setMessage(payload.error || 'Failed to upload resume')
        return
      }

      setSettings((prev) => ({
        ...prev,
        userData: {
          ...prev.userData,
          resumeText: String(payload.extractedText || '').slice(0, 120_000),
        },
      }))
      setResumeFileName(file.name)
      setSaveState('saved')
      setMessage('')
    } catch {
      setMessage('Failed to process resume upload.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={`settings-dialog ${className || ''}`.trim()}>
        <aside className="settings-sidebar">
          <button
            type="button"
            className="settings-close-btn"
            onClick={() => {
              if (onClose) {
                onClose()
                return
              }
              void router.push('/')
            }}
            aria-label="Close settings"
          >
            x
          </button>
          <div className="settings-nav-list">
            <button type="button" className="settings-nav-item active">API Keys & Provider</button>
            <button type="button" className="settings-nav-item">Run Times PT</button>
            <button type="button" className="settings-nav-item">Roles, Locations & Experience</button>
            <button type="button" className="settings-nav-item">Additional Requirements</button>
            <button type="button" className="settings-nav-item">User Data</button>
          </div>
        </aside>
        <div className="settings-main">
          <div className="settings-main-head">
            <h1 className="text-xl font-semibold">Personalization</h1>
          </div>
          <div className="settings-main-body">
            <div className="settings-section-stage">
              <section className="settings-row-block">
                <p className="metric-label">Loading settings...</p>
              </section>
            </div>
            <div className="settings-action-bar">
              <span />
              <div className="settings-action-buttons">
                <button type="button" className="action-pill" disabled>
                  Trigger Run Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`settings-dialog ${className || ''}`.trim()}>
      <aside className="settings-sidebar">
        <button
          type="button"
          className="settings-close-btn"
          onClick={() => {
            if (onClose) {
              onClose()
              return
            }
            void router.push('/')
          }}
          aria-label="Close settings"
        >
          x
        </button>
        <div className="settings-nav-list">
            <button
              type="button"
              className={`settings-nav-item ${activeSection === 'keys' ? 'active' : ''}`}
              onClick={() => setActiveSection('keys')}
            >
              API Keys & Provider
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === 'times' ? 'active' : ''}`}
              onClick={() => setActiveSection('times')}
            >
              Run Times PT
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === 'targets' ? 'active' : ''}`}
              onClick={() => setActiveSection('targets')}
            >
              Roles and Locations
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === 'requirements' ? 'active' : ''}`}
              onClick={() => setActiveSection('requirements')}
            >
              Additional Requirements
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === 'userData' ? 'active' : ''}`}
              onClick={() => setActiveSection('userData')}
            >
              User Data
            </button>
        </div>
      </aside>

      <div className="settings-main">
        <div className="settings-main-head">
          <h1 className="text-xl font-semibold">Personalization</h1>
        </div>

        <div className="settings-main-body">
          <div className="settings-section-stage">
            {activeSection === 'keys' && (
              <section className="settings-row-block">
              <div className="settings-card-head">
                <p className="metric-label">API Keys & Provider</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <label className="metric-label">Apify Key</label>
                  <div className="settings-secret-wrap mt-1">
                    <input
                      type={showApifyKey ? 'text' : 'password'}
                      className="apple-input h-10 w-full rounded-xl px-3 pr-16 text-sm"
                      value={settings.apifyToken}
                      onChange={(e) => setSettings((prev) => ({ ...prev, apifyToken: e.target.value }))}
                      placeholder="apify_api_..."
                    />
                    <button
                      type="button"
                      className="settings-secret-toggle"
                      onClick={() => setShowApifyKey((prev) => !prev)}
                      aria-label={showApifyKey ? 'Hide Apify key' : 'Show Apify key'}
                    >
                      {showApifyKey ? (
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path
                            d="M3 3L21 21M10.58 10.58A2 2 0 0013.42 13.42M9.9 4.24A10.94 10.94 0 0112 4c5 0 9.27 3.11 11 8-1.06 2.98-3.14 5.25-5.76 6.5M6.71 6.72C4.69 8.04 3.11 9.84 2 12c.74 2.07 1.95 3.86 3.5 5.24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path
                            d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle
                            cx="12"
                            cy="12"
                            r="3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="metric-label">LLM API Key</label>
                  <div className="settings-secret-wrap mt-1">
                    <input
                      type={showLlmApiKey ? 'text' : 'password'}
                      className="apple-input h-10 w-full rounded-xl px-3 pr-16 text-sm"
                      value={settings.llmApiKey}
                      onChange={(e) => setSettings((prev) => ({ ...prev, llmApiKey: e.target.value }))}
                      placeholder="provider key"
                    />
                    <button
                      type="button"
                      className="settings-secret-toggle"
                      onClick={() => setShowLlmApiKey((prev) => !prev)}
                      aria-label={showLlmApiKey ? 'Hide LLM API key' : 'Show LLM API key'}
                    >
                      {showLlmApiKey ? (
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path
                            d="M3 3L21 21M10.58 10.58A2 2 0 0013.42 13.42M9.9 4.24A10.94 10.94 0 0112 4c5 0 9.27 3.11 11 8-1.06 2.98-3.14 5.25-5.76 6.5M6.71 6.72C4.69 8.04 3.11 9.84 2 12c.74 2.07 1.95 3.86 3.5 5.24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path
                            d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle
                            cx="12"
                            cy="12"
                            r="3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="metric-label">LLM Provider</label>
                  <CustomSelect
                    value={settings.llmProvider}
                    options={providerOptions}
                    onChange={(value) => {
                      const provider = value as UserSettings['llmProvider']
                      const providerCustomModel = customModels[provider].trim()
                      setSettings((prev) => ({
                        ...prev,
                        llmProvider: provider,
                        llmModel: providerCustomModel || modelOptionsByProvider[provider][0]?.value || '',
                      }))
                    }}
                    ariaLabel="LLM Provider"
                  />
                </div>
                <div>
                  <label className="metric-label">LLM Model</label>
                  <CustomSelect
                    value={modelSelectValue}
                    options={modelOptions}
                    onChange={(value) => {
                      if (value === CUSTOM_MODEL_VALUE) {
                        const customValue = customModels[settings.llmProvider].trim()
                        setSettings((prev) => ({ ...prev, llmModel: customValue }))
                        return
                      }
                      setSettings((prev) => ({ ...prev, llmModel: value }))
                    }}
                    ariaLabel="LLM Model"
                  />
                  {isCustomModelSelected || customModels[settings.llmProvider] ? (
                    <input
                      className="apple-input mt-2 h-10 w-full rounded-xl px-3 text-sm"
                      value={customModels[settings.llmProvider]}
                      onChange={(e) => {
                        const nextValue = e.target.value
                        setCustomModels((prev) => ({ ...prev, [settings.llmProvider]: nextValue }))
                        if (isCustomModelSelected) setSettings((prev) => ({ ...prev, llmModel: nextValue }))
                      }}
                      placeholder={`Custom ${settings.llmProvider} model name`}
                    />
                  ) : null}
                </div>
                <div className="lg:col-span-2">
                  <label className="metric-label">Sources</label>
                  <div className="settings-chip-row mt-1.5">
                    {([
                      ['linkedin', 'LinkedIn'],
                      ['startups', 'Startups'],
                      ['funded', 'Funded'],
                      ['stealth', 'Stealth'],
                    ] as const).map(([key, label]) => {
                      const active = settings.sourceConfig[key]
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`settings-chip ${active ? 'active' : ''}`}
                          onClick={() =>
                            setSettings((prev) => ({
                              ...prev,
                              sourceConfig: { ...prev.sourceConfig, [key]: !prev.sourceConfig[key] },
                            }))
                          }
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </section>
            )}

            {activeSection === 'times' && (
              <section className="settings-row-block">
                <div className="settings-row-head-compact">
                  <p className="metric-label">Run Times PT (max 3)</p>
                </div>
                <div className="settings-chip-row settings-chip-row-compact settings-chip-row-times">
                  {settings.runTimes.map((time) => (
                    <button key={time} type="button" className="settings-chip" onClick={() => removeRunTime(time)}>
                      {time}<span aria-hidden> x</span>
                    </button>
                  ))}
                </div>
                <div className="settings-inline-add settings-inline-add-times">
                  <input
                    className="apple-input h-10 w-full rounded-xl px-3 text-sm"
                    value={runTimeInput}
                    onChange={(e) => setRunTimeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addRunTime()
                      }
                    }}
                    placeholder="HH:MM (24-hour), e.g. 06:30"
                    disabled={settings.runTimes.length >= 3}
                  />
                  <button
                    type="button"
                    className="action-pill secondary settings-add-btn"
                    onClick={addRunTime}
                    disabled={settings.runTimes.length >= 3}
                  >
                    Add
                  </button>
                </div>
              </section>
            )}

            {activeSection === 'targets' && (
              <section className="settings-row-block">
              <div className="settings-card-head">
                <p className="metric-label">Roles, Locations & Experience</p>
                <span className="settings-hint">Max 3 roles, max 3 locations</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <p className="metric-label">Target Roles</p>
                  <div className="settings-inline-add mt-1.5">
                    <input
                      className="apple-input h-9 w-full rounded-xl px-3 text-sm"
                      value={roleInput}
                      onChange={(e) => setRoleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addRole()
                        }
                      }}
                      placeholder="Founding Engineer (max 3)"
                      disabled={settings.targetRoles.length >= 3}
                    />
                    <button type="button" className="action-pill secondary" onClick={addRole} disabled={settings.targetRoles.length >= 3}>Add</button>
                  </div>
                  <div className="settings-chip-row settings-chip-row-compact mt-1.5">
                    {settings.targetRoles.map((role) => (
                      <button key={role} type="button" className="settings-chip" onClick={() => removeRole(role)}>
                        {role}<span aria-hidden> x</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="metric-label">Target Locations</p>
                  <div className="settings-inline-add mt-1.5">
                    <input
                      className="apple-input h-9 w-full rounded-xl px-3 text-sm"
                      value={locationInput}
                      onChange={(e) => setLocationInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addLocation()
                        }
                      }}
                      placeholder="San Francisco Bay Area (max 3)"
                      disabled={settings.targetLocations.length >= 3}
                    />
                    <button type="button" className="action-pill secondary" onClick={addLocation} disabled={settings.targetLocations.length >= 3}>Add</button>
                  </div>
                  <div className="settings-chip-row settings-chip-row-compact mt-1.5">
                    {settings.targetLocations.map((location) => (
                      <button key={location} type="button" className="settings-chip" onClick={() => removeLocation(location)}>
                        {location}<span aria-hidden> x</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                <div>
                  <label className="metric-label">Min Exp</label>
                  <input
                    type="number"
                    className="apple-input mt-1 h-9 w-full rounded-xl px-3 text-sm"
                    value={settings.experienceMin}
                    onChange={(e) => setSettings((prev) => ({ ...prev, experienceMin: Number(e.target.value || 0) }))}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div>
                  <label className="metric-label">Max Exp</label>
                  <input
                    type="number"
                    className="apple-input mt-1 h-9 w-full rounded-xl px-3 text-sm"
                    value={settings.experienceMax}
                    onChange={(e) => setSettings((prev) => ({ ...prev, experienceMax: Number(e.target.value || 0) }))}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
              </div>
            </section>
            )}

            {activeSection === 'requirements' && (
              <section className="settings-row-block">
              <label className="metric-label">Additional Requirements</label>
              <textarea
                className="apple-input mt-2 min-h-32 w-full rounded-xl px-3 py-2 text-sm"
                value={settings.requirements}
                onChange={(e) => setSettings((prev) => ({ ...prev, requirements: e.target.value }))}
                placeholder="Add extra constraints for scraping and ranking..."
              />
            </section>
            )}

            {activeSection === 'userData' && (
              <section className="settings-row-block">
                <div className="settings-card-head">
                  <p className="metric-label">User Data</p>
                  <span className="settings-hint">Used for job matching + outreach personalization</span>
                </div>

                <div className="mt-2">
                  <label className="metric-label">Upload Resume (PDF / DOCX)</label>
                  <div className="settings-inline-add mt-1.5">
                    <label className="apple-input flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm">
                      <span className="action-pill !px-3 !py-1 !text-[11px]">Choose File</span>
                      <span className="truncate text-[var(--apple-text-muted)]">
                        {resumeFileName || 'No file chosen'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null
                          void handleResumeUpload(file)
                        }}
                      />
                    </label>
                  </div>
                  {resumeFileName ? (
                    <p className="settings-hint mt-1">Uploaded: {resumeFileName}</p>
                  ) : null}
                </div>

                <div className="mt-3">
                  <label className="metric-label">Resume Text</label>
                  <textarea
                    className="apple-input mt-1.5 min-h-28 w-full rounded-xl px-3 py-2 text-sm"
                    value={settings.userData.resumeText}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        userData: { ...prev.userData, resumeText: e.target.value.slice(0, 120_000) },
                      }))
                    }
                    placeholder="Extracted resume text appears here (editable)."
                  />
                </div>

                <div className="mt-3">
                  <label className="metric-label">Personal Input</label>
                  <textarea
                    className="apple-input mt-1.5 min-h-24 w-full rounded-xl px-3 py-2 text-sm"
                    value={settings.userData.personalInput}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        userData: { ...prev.userData, personalInput: e.target.value.slice(0, 20_000) },
                      }))
                    }
                    placeholder="Anything else to use for matching/outreach (visa, priorities, projects, constraints)."
                  />
                </div>
              </section>
            )}
          </div>

            <div className="settings-action-bar">
              <div className="settings-action-left">
                {message ? <p className="settings-message">{message}</p> : null}
                {!message && saveState === 'saved' ? <p className="settings-message settings-message-saved">Saved</p> : null}
                {!message && saveState === 'saving' ? <p className="settings-message">Saving...</p> : null}
                {!message && saveState === 'error' ? <p className="settings-message settings-message-error">Save failed</p> : null}
              </div>
              <div className="settings-action-buttons">
                <button type="button" className="action-pill" disabled={saving} onClick={() => void triggerNow()}>
                  {saving ? 'Saving...' : 'Trigger Run Now'}
                </button>
              </div>
            </div>
        </div>
      </div>
    </div>
  )
}
