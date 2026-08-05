import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Complete modal keyboard behavior: optional Escape dismissal, focus entry,
// Tab/Shift+Tab containment, and focus restoration when the dialog closes.
export default function useEscapeToClose(onClose, escapeActive = true, dialogActive = escapeActive) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!dialogActive) return undefined;
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return undefined;

    const previouslyFocused = document.activeElement;
    const hadTabIndex = dialog.hasAttribute('tabindex');
    if (!hadTabIndex) dialog.setAttribute('tabindex', '-1');
    const initialTarget = dialog.querySelector('[autofocus]') || dialog.querySelector(FOCUSABLE) || dialog;
    initialTarget.focus();

    const handler = (e) => {
      const openDialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (openDialogs[openDialogs.length - 1] !== dialog) return;
      if (e.key === 'Escape' && escapeActive) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll(FOCUSABLE)].filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (!hadTabIndex) dialog.removeAttribute('tabindex');
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [escapeActive, dialogActive]);
}
