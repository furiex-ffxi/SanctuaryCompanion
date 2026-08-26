import { useEffect, useState } from 'react';

const EMPTY_REQUEST = {
  key: '',
  status: 'idle',
  data: null,
  error: '',
};

export function useGlobalItemSearchResults(query, sharedFile, filters = {}) {
  const requestKey = [sharedFile, query, JSON.stringify(filters)].join('\0');
  const [request, setRequest] = useState(EMPTY_REQUEST);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setRequest({ ...EMPTY_REQUEST, key: requestKey });
      return;
    }

    const controller = new AbortController();
    let disposed = false;
    setRequest({ key: requestKey, status: 'pending', data: null, error: '' });

    const timer = setTimeout(async () => {
      if (disposed) return;
      setRequest({ key: requestKey, status: 'loading', data: null, error: '' });

      try {
        const params = new URLSearchParams({
          q: normalizedQuery,
          sharedFile,
          limit: '10',
        });
        Object.entries(filters).forEach(([key, value]) => { if (value !== '' && value != null) params.set(key, value); });
        const response = await fetch('/__item_search?' + params, {
          signal: controller.signal,
        });
        if (disposed) return;

        const data = await response.json();
        if (disposed) return;
        if (!response.ok) throw Error(data.error);

        setRequest({
          key: requestKey,
          status: 'success',
          data,
          error: '',
        });
      } catch (error) {
        if (!disposed && error.name !== 'AbortError') {
          setRequest({
            key: requestKey,
            status: 'error',
            data: null,
            error: error.message,
          });
        }
      }
    }, 250);

    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, requestKey, sharedFile]);

  const current = request.key === requestKey ? request : EMPTY_REQUEST;
  return {
    data: current.data,
    busy: current.status === 'loading',
    error: current.error,
  };
}
