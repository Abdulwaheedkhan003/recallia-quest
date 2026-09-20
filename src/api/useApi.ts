import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './client'
import { useLive } from '../state/realtime'

/**
 * Load data from the API and keep it fresh: reloads when any of `liveEvents`
 * arrives over the realtime socket (e.g. a change made on another device).
 */
export function useApi<T>(path: string | null, liveEvents: string[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(Boolean(path))

  const reload = useCallback(async () => {
    if (!path) return
    try {
      const d = await api.get<T>(path)
      setData(d)
      setError(null)
    } catch (e) {
      setError(e as ApiError)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    setLoading(Boolean(path))
    void reload()
  }, [reload, path])

  useLive(liveEvents, () => void reload())
  return { data, error, loading, reload, setData }
}
