import { Link } from 'react-router-dom';

// Bump this when the consent wording changes; the value the user agreed to is
// recorded server-side for compliance. Date-based so it's self-documenting.
export const CONSENT_VERSION = '2026-07-21';

// Build the consent payload sent with a lead submission. `hasPhone` decides
// whether SMS is an applicable channel (only when the user gave a phone number).
export function buildConsent(hasPhone = false) {
  return {
    agreed: true,
    version: CONSENT_VERSION,
    channels: hasPhone ? ['email', 'sms'] : ['email'],
  };
}

// Consent checkbox (never pre-checked — Golden Rule #5). Shown before submit;
// the parent should block submission until `checked` is true.
export default function ConsentCheckbox({ checked, onChange, includeSms = false, id = 'consent' }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 cursor-pointer select-none">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-[#FD4403] focus:ring-2 focus:ring-brand-500"
      />
      <span className="text-xs text-gray-500 leading-relaxed">
        I agree to be contacted by FlacronAI by email{includeSms ? ' and SMS' : ''} regarding my inquiry.
        Consent is voluntary and I can withdraw it at any time. I have read and agree to the{' '}
        <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline font-medium">Privacy Policy</Link>
        {' '}and{' '}
        <Link to="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline font-medium">Terms of Service</Link>.
      </span>
    </label>
  );
}
