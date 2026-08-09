import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import useEscapeToClose from '../hooks/useEscapeToClose.js';
import ConsentCheckbox, { buildConsent } from './ConsentCheckbox.jsx';
import { salesAPI } from '../services/api.js';

/**
 * LeadCaptureModal — gates document downloads with a name+email form.
 *
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {function} onClose - Close handler
 * @param {string} documentName - Display name of the document ("Sample Report")
 * @param {string} documentUrl - URL to download after form submission ("/sample-report.pdf")
 * @param {string} source - Tracking source for the lead ("sample-report-download")
 */
export default function LeadCaptureModal({ isOpen, onClose, documentName, documentUrl, source }) {
  const [form, setForm] = useState({ name: '', email: '' });
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEscapeToClose(onClose, !loading && isOpen && !success, isOpen);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
    if (!form.name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      // Submit lead with marketing consent if checked
      await salesAPI.contact({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        subject: 'Document Download',
        message: `Requested download: ${documentName}`,
        source: source || 'document-download',
        // Only include consent object if the user checked the box
        consent: marketingConsent ? buildConsent(false) : null,
      });

      setSuccess(true);

      // Trigger the download after a brief success message display
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = documentUrl;
        link.download = documentUrl.split('/').pop();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Close modal after download starts
        setTimeout(() => {
          onClose();
          // Reset form state after close animation
          setTimeout(() => {
            setForm({ name: '', email: '' });
            setMarketingConsent(false);
            setSuccess(false);
          }, 300);
        }, 1500);
      }, 800);
    } catch (err) {
      console.error('Lead capture error:', err);
      toast.error('Failed to process request. Please try again.');
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    onClose();
    // Reset after close animation
    setTimeout(() => {
      setForm({ name: '', email: '' });
      setMarketingConsent(false);
      setSuccess(false);
    }, 300);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-capture-title"
            className="card w-full max-w-md relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            {!success && (
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                aria-label="Close"
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {success ? (
              // Success state
              <div className="p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1 }}
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                </motion.div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Download Starting...
                </h2>
                <p className="text-sm text-gray-600">
                  Your download should begin shortly. Thank you for your interest in FlacronAI!
                </p>
              </div>
            ) : (
              // Form state
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                    <Download className="w-5 h-5 text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 id="lead-capture-title" className="text-lg font-bold text-gray-900">
                      Download {documentName}
                    </h2>
                    <p className="text-xs text-gray-500">Enter your details to continue</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="lead-name" className="label">
                      Your Name *
                    </label>
                    <input
                      id="lead-name"
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="John Smith"
                      className="input"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="lead-email" className="label">
                      Email Address *
                    </label>
                    <input
                      id="lead-email"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="john@example.com"
                      className="input"
                      disabled={loading}
                    />
                  </div>

                  {/* Optional marketing consent — never pre-checked */}
                  <div className="pt-2">
                    <ConsentCheckbox
                      id="lead-marketing-consent"
                      checked={marketingConsent}
                      onChange={setMarketingConsent}
                      includeSms={false}
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Download {documentName}
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 text-center leading-relaxed">
                    Your information is used solely to provide you with the document and, if you consented, product updates. We never sell your data.
                  </p>
                </form>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
