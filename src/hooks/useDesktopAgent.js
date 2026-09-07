import { useQuery } from '@tanstack/react-query'

export const AGENT_BASE_URL = 'http://127.0.0.1:5174'

async function fetchAgentStatus() {
  try {
    const res = await fetch(`${AGENT_BASE_URL}/status`, {
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.role === 'desktop-agent' ? data : null
  } catch {
    return null
  }
}

/**
 * Hook to discover and interact with the local Desktop Agent on port 5174.
 */
export function useDesktopAgent() {
  const { data: agentStatus, refetch } = useQuery({
    queryKey: ['desktopAgentStatus'],
    queryFn: fetchAgentStatus,
    refetchInterval: 8_000,
    retry: false,
  })

  const isAgentConnected = Boolean(agentStatus?.ok && agentStatus?.role === 'desktop-agent')

  const setAgentTime = async ({ datetime, restore = false }) => {
    const res = await fetch(`${AGENT_BASE_URL}/set_time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datetime, restore }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Failed to set time on desktop')
    return data
  }

  const triggerAgentSync = async (selectedFiles = null) => {
    const res = await fetch(`${AGENT_BASE_URL}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedFiles }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Desktop agent sync failed')
    return data
  }

  return {
    isAgentConnected,
    agentStatus,
    setAgentTime,
    triggerAgentSync,
    refetchAgent: refetch,
  }
}
