import { useState, useCallback } from 'react';

let _addToast = null;

export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [{ id, message, type, ts: new Date() }, ...prev].slice(0, 50));
    // Auto-dismiss success/info toasts after 4s
    if (type !== 'error') {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    }
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Register global accessor so hooks without direct access can emit toasts
  _addToast = addToast;

  return { toasts, addToast, dismissToast };
}

/** Call from anywhere (e.g. useCharacterCompanion) to push a toast. */
export function emitToast(message, type = 'info') {
  if (_addToast) _addToast(message, type);
  else console.log('[Toast]', type, message);
}
