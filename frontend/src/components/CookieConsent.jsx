import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, X, Check } from 'lucide-react';
import useEscapeToClose from '../hooks/useEscapeToClose.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  COOKIE_CATEGORIES,
  OPEN_PREFERENCES_EVENT,
  getStoredConsent,
  hasDecided,
  acceptAll,
  rejectNonEssential,
  saveConsent,
  isDoNotTrackEnabled,
} from '../utils/cookieConsent.js';

// Accessible on/off switch for an optional cookie category.
const CategoryToggle = ({ category, checked, onChange }) => {
  const disabled = category.required;
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{category.label}</p>
        <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{category.description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${category.label} cookies`}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative shrink-0 mt-0.5 h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
          checked ? 'bg-primary' : 'bg-gray-300'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-bg shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};

const CookieConsent = () => {
  // The banner is mounted inside AuthProvider, so `user` is available (null when
  // signed out). We record the uid on the consent record when it's known.
  const { user } = useAuth();

  const [showBanner, setShowBanner] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  // Draft toggle state for the preference center (optional categories only).
  const [draft, setDraft] = useState({ analytics: false, preferences: false });

  useEscapeToClose(() => setShowPrefs(false), true, showPrefs);

  // Seed the draft from stored consent, or from a DNT-aware default.
  const seedDraft = useCallback(() => {
    const stored = getStoredConsent();
    if (stored?.categories) {
      setDraft({
        analytics: !!stored.categories.analytics,
        preferences: !!stored.categories.preferences,
      });
    } else {
      // Honor Do Not Track: optional categories default off.
      setDraft({ analytics: false, preferences: false });
    }
  }, []);

  useEffect(() => {
    if (!hasDecided()) setShowBanner(true);
    seedDraft();
    // Footer "Manage Cookie Preferences" and any code calling openCookiePreferences().
    const openHandler = () => {
      seedDraft();
      setShowPrefs(true);
    };
    window.addEventListener(OPEN_PREFERENCES_EVENT, openHandler);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, openHandler);
  }, [seedDraft]);

  const consentOpts = { userId: user?.uid || null };

  const handleAcceptAll = () => {
    acceptAll(consentOpts);
    setShowBanner(false);
    setShowPrefs(false);
  };

  const handleRejectNonEssential = () => {
    rejectNonEssential(consentOpts);
    setShowBanner(false);
    setShowPrefs(false);
  };

  const handleSavePrefs = () => {
    saveConsent(draft, consentOpts);
    setShowBanner(false);
    setShowPrefs(false);
  };

  const openPrefs = () => {
    seedDraft();
    setShowPrefs(true);
  };

  const dnt = isDoNotTrackEnabled();

  return (
    <>
      {/* Consent banner — non-blocking region shown until a choice is made */}
      <AnimatePresence>
        {showBanner && !showPrefs && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.3 }}
            role="region"
            aria-label="Cookie consent"
            className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
          >
            <div className="max-w-5xl mx-auto card shadow-card border-border p-5 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
                    <Cookie className="w-5 h-5 text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900 mb-1">We value your privacy</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      We use strictly necessary cookies to run the site, and — only with your
                      consent — optional analytics and preference cookies. Read our{' '}
                      <Link to="/cookies-policy" className="text-brand-600 hover:underline font-medium">Cookies Policy</Link>
                      {' '}and{' '}
                      <Link to="/privacy-policy" className="text-brand-600 hover:underline font-medium">Privacy Policy</Link>.
                      {dnt && (
                        <span className="block mt-1 text-xs text-gray-500">
                          Your browser sends “Do Not Track” — optional cookies stay off unless you turn them on.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 lg:shrink-0">
                  <button
                    type="button"
                    onClick={openPrefs}
                    className="btn-secondary !py-2.5 !px-4 text-sm whitespace-nowrap"
                  >
                    Customize
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectNonEssential}
                    className="btn-secondary !py-2.5 !px-4 text-sm whitespace-nowrap"
                  >
                    Reject non-essential
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptAll}
                    className="btn-primary !py-2.5 !px-4 text-sm whitespace-nowrap"
                  >
                    Accept all
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preference center — modal dialog */}
      <AnimatePresence>
        {showPrefs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowPrefs(false)}
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 20 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cookie-prefs-title"
              className="card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 sm:p-6 border-b border-border sticky top-0 bg-surface z-10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
                    <Cookie className="w-4 h-4 text-brand-600" />
                  </div>
                  <h2 id="cookie-prefs-title" className="text-lg font-bold text-gray-900">Cookie preferences</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrefs(false)}
                  aria-label="Close cookie preferences"
                  className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 sm:p-6">
                <p className="text-sm text-gray-600 leading-relaxed mb-2">
                  Choose which optional cookies FlacronAI may use. Strictly necessary cookies are always
                  active because the site can’t function without them. See the{' '}
                  <Link to="/cookies-policy" className="text-brand-600 hover:underline font-medium">Cookies Policy</Link>
                  {' '}for the full list.
                </p>

                <div className="mt-2">
                  {COOKIE_CATEGORIES.map((cat) => (
                    <CategoryToggle
                      key={cat.id}
                      category={cat}
                      checked={cat.required ? true : !!draft[cat.id]}
                      onChange={(val) => setDraft((d) => ({ ...d, [cat.id]: val }))}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 p-5 sm:p-6 border-t border-border bg-surface sticky bottom-0">
                <button
                  type="button"
                  onClick={handleRejectNonEssential}
                  className="btn-secondary !py-2.5 !px-4 text-sm"
                >
                  Reject non-essential
                </button>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={handleAcceptAll}
                    className="btn-secondary !py-2.5 !px-4 text-sm"
                  >
                    Accept all
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePrefs}
                    className="btn-primary !py-2.5 !px-4 text-sm flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    Save preferences
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default CookieConsent;
