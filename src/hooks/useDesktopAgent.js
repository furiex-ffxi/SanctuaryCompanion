import { useQuery } from '@tanstack/react-query'
import { SyncAdapter } from '../adapters/SyncAdapter'

export const AGENT_BASE_URL = 'http://127.0.0.1:5174'

async function fetchDirectAgentStatus() {
  try {
    const res = await fetch(`${AGENT_BASE_URL}/status`, {
      signal: AbortSignal.timeout(1200),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.role === 'desktop-agent' ? data : null
  } catch {
    return null
  }
}

/**
 * Hook to discover and interact with the Desktop Agent.
 * Tries direct port 5174 first; if unreachable (e.g. running from laptop or blocked by Chrome PNA),
 * seamlessly falls back to host-proxied /__sync/agent/* endpoints when hostAgent is provided.
 */
export function useDesktopAgent(hostAgent = null) {
  const { data: directStatus, refetch: refetchDirect } = useQuery({
    queryKey: ['desktopAgentStatus'],
    queryFn: fetchDirectAgentStatus,
    refetchInterval: 8_000,
    retry: false,
  })

  const isDirect = Boolean(directStatus?.ok && directStatus?.role === 'desktop-agent')
  const isHostAgent = Boolean(hostAgent?.connected)

  const isAgentConnected = isDirect || isHostAgent
  const agentStatus = isDirect ? directStatus : hostAgent

  const getAgentPreview = async () => {
    const url = isDirect ? `${AGENT_BASE_URL}/preview` : '/__sync/agent/preview'
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `HTTP ${res.status}`)
    }
    return await res.json()
  }

  const triggerAgentSync = async (selectedFiles = null, resolutions = null) => {
    const url = isDirect ? `${AGENT_BASE_URL}/sync` : '/__sync/agent/sync'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedFiles, resolutions }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Desktop agent sync failed')
    return data
  }

  const setAgentTime = async ({ datetime, restore = false }) => {
    const url = isDirect ? `${AGENT_BASE_URL}/set_time` : '/__sync/agent/set_time'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datetime, restore }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Failed to set time on desktop')
    return data
  }

  const repairAgentTimestamps = async () => {
    const url = isDirect ? `${AGENT_BASE_URL}/repair` : '/__sync/agent/repair'
    const res = await fetch(url, { method: 'POST' })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Failed to repair desktop timestamps')
    return data
  }

  return {
    isAgentConnected,
    agentStatus,
    isDirect,
    isHostProxied: isHostAgent,
    setAgentTime,
    repairAgentTimestamps,
    getAgentPreview,
    triggerAgentSync,
    refetchAgent: refetchDirect,
  }
}
