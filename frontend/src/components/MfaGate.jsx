import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

// Blocking screen shown after a Firebase sign-in when the account has TOTP
// MFA enabled. The Firebase idToken is already valid at this point (the web
// app authenticates via the Firebase client SDK directly) — this only gates
// app access until the second factor is confirmed for this session.
const MfaGate = ({ onVerified }) => {
  const { logout } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code.length < 6) return;
    setLoading(true);
    try {
      await authAPI.mfaVerify(code);
      onVerified();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="card p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-8 h-8 text-orange-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Two-Factor Authentication</h2>
        <p className="text-gray-600 text-sm mb-6">Enter the 6-digit code from your authenticator app.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            maxLength={8}
            autoFocus
            className="input text-center text-lg tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
          />
          <button type="submit" disabled={loading || code.length < 6} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
        <button onClick={() => logout()} className="block mx-auto mt-4 text-gray-500 hover:text-gray-700 text-xs">
          ← Sign in with a different account
        </button>
      </div>
    </div>
  );
};

export default MfaGate;
