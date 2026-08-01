import { useEffect } from 'react';

// Closes a modal/dialog on Escape. No modal in this app previously supported
// keyboard dismissal at all -- pass the same onClose used for the backdrop click.
export default function useEscapeToClose(onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, active]);
}
