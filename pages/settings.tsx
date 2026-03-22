import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import CustomSelect, { SelectOption } from '../components/CustomSelect'

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
}

const normalizeRunTime = (value: string): string | null => {
  const cleaned = value.trim()
  const match = cleaned.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  const hour = match[1].padStart(2, '0')
  const minute = match[2]
  return `${hour}:${minute}`
}

export default function SettingsPage() {
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
  const [roleInput, setRoleInput] = useState('')
  const [runTimeInput, setRunTimeInput] = useState('')
  const [locationInput, setLocationInput] = useState('')

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
        const merged = {
          ...defaultSettings,
          ...payload,
        }
        const providerModels = modelOptionsByProvider[merged.llmProvider] || modelOptionsByProvider.openai
        const nextCustomModels: Record<UserSettings['llmProvider'], string> = {
          openai: '',
          claude: '',
          gemini: '',
        }
        if (!providerModels.some((item) => item.value === merged.llmModel)) {
          nextCustomModels[merged.llmProvider] = merged.llmModel
        }
        merged.targetRoles = (merged.targetRoles || []).slice(0, 3)
        merged.targetLocations = (merged.targetLocations || []).slice(0, 3)
        merged.runTimes = (merged.runTimes || []).slice(0, 3)
        merged.timezone = 'America/Los_Angeles'
        setCustomModels(nextCustomModels)
        setSettings(merged)
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const addRole = () => {
    const value = roleInput.trim()
    if (!value) return
    if (settings.targetRoles.length >= 3) {
      setMessage('Maximum 3 target roles allowed.')
      return
    }
    if (settings.targetRoles.some((role) => role.toLowerCase() === value.toLowerCase())) {
      setMessage('Role already added.')
      return
    }
    setSettings((prev) => ({ ...prev, targetRoles: [...prev.targetRoles, value] }))
    setRoleInput('')
    setMessage('')
  }

  const removeRole = (role: string) => {
    setSettings((prev) => ({ ...prev, targetRoles: prev.targetRoles.filter((item) => item !== role) }))
  }

  const addRunTime = () => {
    if (settings.runTimes.length >= 3) {
      setMessage('Maximum 3 run times allowed.')
      return
    }
    const normalized = normalizeRunTime(runTimeInput)
    if (!normalized) {
      setMessage('Use run time format HH:MM (24-hour), e.g. 06:30.')
      return
    }
    if (settings.runTimes.includes(normalized)) {
      setMessage('Run time already added.')
      return
    }
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
    if (settings.targetLocations.length >= 3) {
      setMessage('Maximum 3 locations allowed.')
      return
    }
    if (settings.targetLocations.some((location) => location.toLowerCase() === value.toLowerCase())) {
      setMessage('Location already added.')
      return
    }
    setSettings((prev) => ({ ...prev, targetLocations: [...prev.targetLocations, value] }))
    setLocationInput('')
    setMessage('')
  }

  const removeLocation = (location: string) => {
    setSettings((prev) => ({ ...prev, targetLocations: prev.targetLocations.filter((item) => item !== location) }))
  }

  const saveSettings = async () => {
    if (!settings.llmModel.trim()) {
      setMessage('Please choose a model or enter a custom model name.')
      return
    }
    setMessage('')
    setSaving(true)
    try {
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          timezone: 'America/Los_Angeles',
          targetRoles: settings.targetRoles.slice(0, 3),
          targetLocations: settings.targetLocations.slice(0, 3),
          runTimes: settings.runTimes.slice(0, 3),
        }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setMessage(payload.error || 'Failed to save settings')
        return
      }
      setMessage('Settings saved.')
    } catch {
      setMessage('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const triggerNow = async () => {
    setMessage('')
    try {
      const response = await fetch('/api/user/trigger', { method: 'POST' })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setMessage(payload.error || 'Failed to queue run')
        return
      }
      setMessage('Run queued for this user.')
    } catch {
      setMessage('Failed to queue run')
    }
  }

  if (loading) {
    return <div className="apple-shell min-h-screen p-6">Loading settings...</div>
  }

  return (
    <div className="apple-shell min-h-screen p-4 text-[var(--apple-text)] sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <button type="button" className="action-pill secondary" onClick={() => void router.push('/')}>
            Back
          </button>
        </div>

        <div className="compact-panel settings-shell">
          <div className="settings-grid">
            <section className="settings-card">
              <div className="settings-card-head">
                <p className="metric-label">Automation Keys</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="metric-label">Apify Key</label>
                  <input
                    className="apple-input mt-1 h-10 w-full rounded-xl px-3 text-sm"
                    value={settings.apifyToken}
                    onChange={(e) => setSettings((prev) => ({ ...prev, apifyToken: e.target.value }))}
                    placeholder="apify_api_..."
                  />
                </div>
                <div>
                  <label className="metric-label">LLM API Key</label>
                  <input
                    className="apple-input mt-1 h-10 w-full rounded-xl px-3 text-sm"
                    value={settings.llmApiKey}
                    onChange={(e) => setSettings((prev) => ({ ...prev, llmApiKey: e.target.value }))}
                    placeholder="provider key"
                  />
                </div>
              </div>
            </section>

            <section className="settings-card">
              <div className="settings-card-head">
                <p className="metric-label">LLM Setup</p>
                <span className="settings-hint">Provider + top 3 model choices</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
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
                  <label className="metric-label">LLM Model (Top 3)</label>
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
                        if (isCustomModelSelected) {
                          setSettings((prev) => ({ ...prev, llmModel: nextValue }))
                        }
                      }}
                      placeholder={`Custom ${settings.llmProvider} model name`}
                    />
                  ) : null}
                </div>
              </div>
            </section>

            <section className="settings-card">
              <div className="settings-card-head">
                <p className="metric-label">Run Times PT</p>
                <div className="settings-chip-row">
                  {settings.runTimes.map((time) => (
                    <button key={time} type="button" className="settings-chip" onClick={() => removeRunTime(time)}>
                      {time}
                      <span aria-hidden> x</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-inline-add">
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
                <button type="button" className="action-pill secondary" onClick={addRunTime} disabled={settings.runTimes.length >= 3}>
                  Add
                </button>
              </div>
            </section>

            <section className="settings-card">
              <div className="settings-card-head">
                <p className="metric-label">Experience Window</p>
                <span className="settings-hint">Years</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="metric-label">Min Exp</label>
                  <input
                    type="number"
                    className="apple-input mt-1 h-10 w-full rounded-xl px-3 text-sm"
                    value={settings.experienceMin}
                    onChange={(e) => setSettings((prev) => ({ ...prev, experienceMin: Number(e.target.value || 0) }))}
                  />
                </div>
                <div>
                  <label className="metric-label">Max Exp</label>
                  <input
                    type="number"
                    className="apple-input mt-1 h-10 w-full rounded-xl px-3 text-sm"
                    value={settings.experienceMax}
                    onChange={(e) => setSettings((prev) => ({ ...prev, experienceMax: Number(e.target.value || 0) }))}
                  />
                </div>
              </div>
            </section>

            <section className="settings-card">
              <div className="settings-card-head">
                <p className="metric-label">Target Roles</p>
                <div className="settings-chip-row">
                  {settings.targetRoles.map((role) => (
                    <button key={role} type="button" className="settings-chip" onClick={() => removeRole(role)}>
                      {role}
                      <span aria-hidden> x</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-inline-add">
                <input
                  className="apple-input h-10 w-full rounded-xl px-3 text-sm"
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
                <button type="button" className="action-pill secondary" onClick={addRole} disabled={settings.targetRoles.length >= 3}>
                  Add
                </button>
              </div>
            </section>

            <section className="settings-card">
              <div className="settings-card-head">
                <p className="metric-label">Target Locations</p>
                <div className="settings-chip-row">
                  {settings.targetLocations.map((location) => (
                    <button key={location} type="button" className="settings-chip" onClick={() => removeLocation(location)}>
                      {location}
                      <span aria-hidden> x</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-inline-add">
                <input
                  className="apple-input h-10 w-full rounded-xl px-3 text-sm"
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
                <button type="button" className="action-pill secondary" onClick={addLocation} disabled={settings.targetLocations.length >= 3}>
                  Add
                </button>
              </div>
            </section>

            <section className="settings-card settings-full-row">
              <label className="metric-label">Additional Requirements</label>
              <textarea
                className="apple-input mt-1 min-h-44 w-full rounded-xl px-3 py-2 text-sm"
                value={settings.requirements}
                onChange={(e) => setSettings((prev) => ({ ...prev, requirements: e.target.value }))}
              />
            </section>
          </div>

          <div className="settings-action-bar">
            <div className="settings-action-meta">
              <p className="settings-action-title">Save your pipeline profile</p>
              <p className="settings-action-subtitle">Timezone is fixed to PST for run scheduling.</p>
              {message ? <p className="settings-message">{message}</p> : null}
            </div>
            <div className="settings-action-buttons">
              <button type="button" className="action-pill" disabled={saving} onClick={() => void saveSettings()}>
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              <button type="button" className="action-pill secondary" onClick={() => void triggerNow()}>
                Trigger Run Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
