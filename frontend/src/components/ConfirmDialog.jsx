import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import useEscapeToClose from '../hooks/useEscapeToClose';

// Shared confirm-before-destructive-action modal. Render inside an
// <AnimatePresence> at the call site so it animates in/out correctly.
export default function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  loading = false, danger = true, onConfirm, onClose,
}) {
  useEscapeToClose(onClose, !loading, true);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div className="card w-full max-w-sm p-6" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={e => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className={`w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center ${danger ? 'bg-red-500/20' : 'bg-brand-500/20'}`}>
            <AlertTriangle className={`w-6 h-6 ${danger ? 'text-red-400' : 'text-brand-400'}`} />
          </div>
          <h2 id="confirm-dialog-title" className="text-lg font-bold text-gray-900 mb-2">{title}</h2>
          {message && <p className="text-gray-600 text-sm">{message}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">{cancelLabel}</button>
          <button onClick={onConfirm} disabled={loading} className={`flex-1 text-sm py-2 disabled:opacity-50 ${danger ? 'btn-danger' : 'btn-primary'}`}>
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
