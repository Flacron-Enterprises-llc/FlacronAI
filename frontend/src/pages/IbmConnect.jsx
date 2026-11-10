import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { ibmAPI } from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import Seo from '../components/Seo.jsx';

// Landing page for the signed dashboard link IBM Cloud shows a customer who
// added the FlacronAI agent from the IBM Cloud catalog. Links that IBM
// subscription to the signed-in FlacronAI account, then points them at API
// keys + the OpenAPI tools for watsonx Orchestrate.
export default function IbmConnect() {
  const [params] = useSearchParams();
  const { refreshProfile } = useAuth();
  const [state, setState] = useState({ status: 'linking', message: '', planKind: null });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const instanceId = params.get('instance');
    const sig = params.get('sig');
    if (!instanceId || !sig) {
      setState({ status: 'error', message: 'This link is incomplete. Open the agent again from your IBM Cloud resource list.' });
      return;
    }
    ibmAPI.link(instanceId, sig)
      .then(async (res) => {
        await refreshProfile?.().catch(() => {});
        setState({ status: 'done', message: '', planKind: res.data.planKind });
      })
      .catch((err) => {
        setState({ status: 'error', message: err.response?.data?.error || 'Could not link your IBM subscription. Please try again.' });
      });
  }, [params, refreshProfile]);

  const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '').replace(/\/api(\/v\d+)?$/, '');
  const openapiUrl = `${apiBase}/api/v1/orchestrate/openapi.json`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <Seo title="Connect IBM Cloud" noindex />
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <p className="text-xs font-semibold tracking-wide text-orange-600 uppercase mb-2">IBM Cloud</p>
        {state.status === 'linking' && (
          <div className="flex items-center gap-3 text-gray-700">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            <span>Linking your IBM Cloud subscription to FlacronAI…</span>
          </div>
        )}

        {state.status === 'error' && (
          <div>
            <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" /> Could not link
            </div>
            <p className="text-gray-700">{state.message}</p>
          </div>
        )}

        {state.status === 'done' && (
          <div>
            <div className="flex items-center gap-2 text-green-700 font-semibold text-lg mb-3">
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" /> Your IBM subscription is linked
            </div>
            <p className="text-gray-700 mb-4">
              {state.planKind === 'starter'
                ? 'Starter plan: IBM bills report generations in packs, so your FlacronAI monthly report limit does not apply.'
                : 'Free plan: the agent uses your FlacronAI plan and its monthly report limit.'}
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-gray-700 mb-6">
              <li>
                Create an API key in <Link className="text-orange-600 underline" to="/settings?tab=api-keys">Settings &gt; API</Link>.
                It is shown once, so copy it.
              </li>
              <li>
                In watsonx Orchestrate, choose <strong>Import tools from OpenAPI</strong> and use:
                <code className="block mt-1 p-2 bg-gray-100 rounded text-sm break-all">{openapiUrl}</code>
              </li>
              <li>Set the connection to an API key sent in the <code>x-api-key</code> header.</li>
            </ol>
            <Link to="/developers" className="text-orange-600 underline">Read the developer guide</Link>
          </div>
        )}
      </div>
    </div>
  );
}
