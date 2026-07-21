import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, FileText, ShieldCheck, AlertCircle } from 'lucide-react';
import { reportsAPI } from '../services/api';

// Lightweight markdown → elements for the read-only shared view.
function renderContent(md) {
  const lines = (md || '').split('\n');
  const out = [];
  let table = null;
  let key = 0;
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table.filter(r => !/^\|\s*[-:]+\s*\|/.test(r));
    const cells = (r) => r.split('|').slice(1, -1).map(c => c.trim());
    out.push(
      <div key={`t${key++}`} className="overflow-x-auto my-4">
        <table className="w-full text-sm border border-gray-200 rounded-lg">
          {head && <thead><tr className="bg-gray-50">{cells(head).map((c, i) => <th key={i} className="text-left px-3 py-2 font-semibold text-gray-700 border-b border-gray-200">{c.replace(/\*\*/g, '')}</th>)}</tr></thead>}
          <tbody>{rows.map((r, ri) => <tr key={ri} className="border-b border-gray-100 last:border-0">{cells(r).map((c, i) => <td key={i} className="px-3 py-2 text-gray-600">{c.replace(/\*\*/g, '')}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    table = null;
  };
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '$1');
  for (const line of lines) {
    if (line.trim().startsWith('|')) { (table = table || []).push(line); continue; }
    flushTable();
    if (line.startsWith('# ')) out.push(<h1 key={key++} className="text-2xl font-bold text-gray-900 mt-6 mb-3">{inline(line.slice(2))}</h1>);
    else if (line.startsWith('## ')) out.push(<h2 key={key++} className="text-lg font-bold text-white bg-brand-600 rounded-lg px-3 py-2 mt-6 mb-3">{inline(line.slice(3))}</h2>);
    else if (line.startsWith('### ')) out.push(<h3 key={key++} className="text-base font-semibold text-gray-900 mt-4 mb-2">{inline(line.slice(4))}</h3>);
    else if (line.startsWith('> ')) out.push(<p key={key++} className="text-sm text-gray-500 italic border-l-2 border-brand-200 pl-3 my-3">{inline(line.slice(2))}</p>);
    else if (line.trim().startsWith('- ')) out.push(<li key={key++} className="text-sm text-gray-600 ml-5 list-disc">{inline(line.trim().slice(2))}</li>);
    else if (line.trim()) out.push(<p key={key++} className="text-sm text-gray-700 leading-relaxed my-2">{inline(line)}</p>);
  }
  flushTable();
  return out;
}

export default function SharedReport() {
  const { token } = useParams();
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    document.title = 'Shared Inspection Report — FlacronAI';
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    (async () => {
      try {
        const res = await reportsAPI.getShared(token);
        setReport(res.data.report);
        setStatus('ok');
      } catch { setStatus('notfound'); }
    })();
    return () => { document.head.removeChild(meta); };
  }, [token]);

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading report…</div>;
  }
  if (status === 'notfound') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <AlertCircle className="w-12 h-12 text-gray-300 mb-4" />
        <h1 className="text-xl font-bold text-gray-900">Report not available</h1>
        <p className="text-gray-500 mt-2 max-w-sm">This share link is invalid, has been revoked, or the report is no longer available.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <img src="/logo-mark.svg" alt="FlacronAI" className="w-8 h-8" />
            <span className="font-bold text-gray-900">Flacron<span className="text-brand-600">AI</span></span>
          </div>
          <button onClick={() => window.print()} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-10 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
            <FileText className="w-4 h-4" /> Inspection Report · Claim {report.claimNumber || '—'}
          </div>
          <div className="prose-report">{renderContent(report.content)}</div>

          {report.signature?.name && (
            <div className="mt-8 pt-4 border-t border-gray-200 flex items-start gap-2 text-sm text-gray-600">
              <ShieldCheck className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <span>Electronically signed by <span className="font-semibold text-gray-800">{report.signature.name}</span>{report.signature.title ? `, ${report.signature.title}` : ''}{report.signature.signedAt ? ` on ${new Date(report.signature.signedAt).toLocaleString()}` : ''}.</span>
            </div>
          )}
          <p className="mt-6 text-[11px] text-gray-400">Prepared with AI assistance and reviewed by a licensed adjuster. This document does not constitute a final determination of cause, coverage, liability, or loss value.</p>
        </div>
      </div>
    </div>
  );
}
