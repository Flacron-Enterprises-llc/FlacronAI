import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import {
  RefreshCw, AlertCircle, ClipboardList, ChevronDown, ChevronUp, Lock, Calendar,
} from 'lucide-react';
import { organizationAPI } from '../services/api';
import { formatStatus } from '../utils/formatStatus';

// Phase 17 (Organization Admin & Audit Log Viewer). Shared between the
// standalone `/audit-logs` page and the Audit Logs tab inside
// OrganizationAdmin.jsx -- self-contained (owns its own loading/empty/error/
// restricted states) so both call sites just render <AuditLogViewer /> with
// zero duplicated wiring.
const RANGE_OPTIONS = [
  { id: '7d', label: '7 Days', days: 7 },
  { id: '30d', label: '30 Days', days: 30 },
  { id: '90d', label: '90 Days', days: 90 },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Custom' },
];

const todayLocalStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const localDayStartISO = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
};
const localDayEndISO = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
};

export default function AuditLogViewer() {
  const [range, setRange] = useState('90d');
  const [customStart, setCustomStart] = useState(todayLocalStr());
  const [customEnd, setCustomEnd] = useState(todayLocalStr());
  const [action, setAction] = useState('');
  const [actorUid, setActorUid] = useState('');
  const [targetType, setTargetType] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState(null);

  // Guards against an out-of-order response: rapidly changing filters fires
  // a new request before the previous one resolves, and network timing
  // doesn't guarantee they resolve in the order they were sent -- without
  // this, a slower STALE response for an earlier filter selection could land
  // last and silently overwrite the correct, newer result. Only the request
  // matching the current `latestRequestId` is ever applied to state.
  const latestRequestId = useRef(0);

  const fetchPage = useCallback((page) => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    setErrorCode(null);
    const params = { page, limit: 20 };
    const preset = RANGE_OPTIONS.find((r) => r.id === range);
    if (range === 'custom') {
      params.startDate = localDayStartISO(customStart);
      params.endDate = localDayEndISO(customEnd);
    } else if (preset?.days) {
      params.startDate = new Date(Date.now() - preset.days * 86400000).toISOString();
    } else if (range === 'all') {
      params.startDate = new Date(0).toISOString();
    }
    if (action) params.action = action;
    if (actorUid) params.actorUid = actorUid;
    if (targetType) params.targetType = targetType;

    organizationAPI.getAuditLogs(params)
      .then((res) => { if (requestId === latestRequestId.current) setData(res.data); })
      .catch((err) => { if (requestId === latestRequestId.current) setErrorCode(err?.response?.data?.code || 'ERROR'); })
      .finally(() => { if (requestId === latestRequestId.current) setLoading(false); });
  }, [range, customStart, customEnd, action, actorUid, targetType]);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  const restricted = errorCode === 'ORG_ADMIN_DENIED';
  const genuineError = errorCode && !restricted;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        {RANGE_OPTIONS.map((opt) => (
          <button key={opt.id} onClick={() => setRange(opt.id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              range === opt.id ? 'bg-brand-500 text-white border-brand-500' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            {opt.label}
          </button>
        ))}
        {range === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)}
              className="input text-xs py-1.5 px-2 w-36" aria-label="Custom range start date" />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={customEnd} min={customStart} max={todayLocalStr()} onChange={(e) => setCustomEnd(e.target.value)}
              className="input text-xs py-1.5 px-2 w-36" aria-label="Custom range end date" />
          </div>
        )}
        <button onClick={() => fetchPage(data?.page || 1)} disabled={loading} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50 ml-auto">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {!restricted && (
        <div className="flex flex-wrap gap-2">
          <select value={action} onChange={(e) => setAction(e.target.value)} className="input text-xs py-1.5 px-2 w-auto">
            <option value="">All Actions</option>
            {(data?.actionsSeen || []).map((a) => <option key={a} value={a}>{formatStatus(a)}</option>)}
          </select>
          <select value={actorUid} onChange={(e) => setActorUid(e.target.value)} className="input text-xs py-1.5 px-2 w-auto">
            <option value="">All Members</option>
            {(data?.roster || []).map((m) => <option key={m.uid} value={m.uid}>{m.email}</option>)}
          </select>
          <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="input text-xs py-1.5 px-2 w-auto">
            <option value="">All Resource Types</option>
            {(data?.targetTypesSeen || []).map((t) => <option key={t} value={t}>{formatStatus(t)}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 w-full" />)}
        </div>
      ) : restricted ? (
        <div className="text-center py-10">
          <Lock className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700 font-semibold">Audit logs are limited to Owners, Admins, and Managers</p>
          <p className="text-gray-500 text-sm mt-1">Your role doesn't have permission to view organization activity.</p>
        </div>
      ) : genuineError ? (
        <div className="text-center py-10">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-gray-600 text-sm font-medium mb-3">Could not load audit logs.</p>
          <button onClick={() => fetchPage(1)} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      ) : !data?.items?.length ? (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
          <ClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No activity recorded in this range.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Resource</th>
                  <th className="px-4 py-2.5">IP</th>
                  <th className="px-4 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((log) => (
                  <Fragment key={log.id}>
                    <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId((id) => (id === log.id ? null : log.id))}>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-900 truncate max-w-[180px]">{log.actorEmail || log.actorUid || 'System'}</td>
                      <td className="px-4 py-2.5"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">{formatStatus(log.action)}</span></td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{log.targetType ? `${formatStatus(log.targetType)}${log.targetId ? ` · ${log.targetId.slice(0, 8)}…` : ''}` : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap font-mono text-xs">{log.ip || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400">{expandedId === log.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
                    </tr>
                    {expandedId === log.id && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 bg-gray-50 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <p className="text-gray-400 mb-1">User Agent</p>
                              <p className="text-gray-700 break-all">{log.userAgent || '—'}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 mb-1">Details</p>
                              {log.meta && Object.keys(log.meta).length ? (
                                <ul className="space-y-0.5">
                                  {Object.entries(log.meta).map(([k, v]) => (
                                    <li key={k} className="text-gray-700"><span className="text-gray-400">{formatStatus(k)}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>
                                  ))}
                                </ul>
                              ) : <p className="text-gray-400">No additional details.</p>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <button onClick={() => fetchPage(data.page - 1)} disabled={data.page <= 1} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50">Previous</button>
              <span className="text-gray-500 text-xs">Page {data.page} of {data.totalPages} · {data.total} total</span>
              <button onClick={() => fetchPage(data.page + 1)} disabled={data.page >= data.totalPages} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
