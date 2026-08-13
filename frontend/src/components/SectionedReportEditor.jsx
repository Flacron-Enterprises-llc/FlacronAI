import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, FileText, RefreshCw, X } from 'lucide-react';
import { parseReportSections, serializeReportSections } from '../utils/reportSections';
import { reportsAPI } from '../services/api';

export default function SectionedReportEditor({ reportId, value, onChange, disabled = false }) {
  const [sections, setSections] = useState(() => parseReportSections(value));
  const [collapsed, setCollapsed] = useState({});
  const [suggestions, setSuggestions] = useState({});
  const [suggesting, setSuggesting] = useState(null);
  const [suggestionError, setSuggestionError] = useState({});

  useEffect(() => {
    const serialized = serializeReportSections(sections);
    if (serialized !== String(value || '').trim()) setSections(parseReportSections(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSection = (index, updates) => {
    const next = sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, ...updates } : section);
    setSections(next);
    onChange(serializeReportSections(next));
  };

  const requestSuggestion = async section => {
    setSuggesting(section.id);
    setSuggestionError(current => ({ ...current, [section.id]: '' }));
    try {
      const response = await reportsAPI.suggestSection(reportId, { title: section.title, body: section.body });
      setSuggestions(current => ({ ...current, [section.id]: response.data?.suggestion || '' }));
      setCollapsed(current => ({ ...current, [section.id]: false }));
    } catch (error) {
      setSuggestionError(current => ({
        ...current,
        [section.id]: error.response?.data?.error || 'Could not generate a suggestion. Try again.',
      }));
    } finally {
      setSuggesting(null);
    }
  };

  const rejectSuggestion = sectionId => {
    setSuggestions(current => {
      const next = { ...current };
      delete next[sectionId];
      return next;
    });
  };

  const acceptSuggestion = (section, index) => {
    updateSection(index, { body: suggestions[section.id] });
    rejectSuggestion(section.id);
  };

  return (
    <div className="space-y-3" aria-label="Report sections">
      {sections.map((section, index) => {
        const isCollapsed = collapsed[section.id];
        return (
          <section key={section.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-orange-500" />
              {section.level > 0 ? (
                <input
                  value={section.title}
                  onChange={event => updateSection(index, { title: event.target.value })}
                  disabled={disabled}
                  aria-label={`Section ${index + 1} title`}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-orange-400 rounded px-1"
                />
              ) : <h3 className="min-w-0 flex-1 text-sm font-semibold text-gray-900">{section.title}</h3>}
              <button
                type="button"
                onClick={() => requestSuggestion(section)}
                disabled={disabled || suggesting === section.id || !reportId}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                aria-label={`Generate suggestion for ${section.title}`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${suggesting === section.id ? 'animate-spin' : ''}`} />
                Suggest
              </button>
              <button
                type="button"
                onClick={() => setCollapsed(current => ({ ...current, [section.id]: !isCollapsed }))}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200"
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${section.title}`}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
            </div>
            {!isCollapsed && (
              <div>
                <textarea
                  value={section.body}
                  onChange={event => updateSection(index, { body: event.target.value })}
                  disabled={disabled}
                  aria-label={`${section.title} content`}
                  rows={Math.max(4, Math.min(14, section.body.split('\n').length + 2))}
                  className="block w-full resize-y border-0 bg-white p-4 text-sm leading-6 text-gray-700 outline-none focus:ring-2 focus:ring-inset focus:ring-orange-400"
                  spellCheck
                />
                {suggestionError[section.id] && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700" role="alert">{suggestionError[section.id]}</p>}
                {suggestions[section.id] !== undefined && (
                  <div className="border-t border-blue-200 bg-blue-50 p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div><p className="text-xs font-bold uppercase tracking-wider text-blue-800">Suggested edit — not applied</p><p className="text-xs text-blue-700">Review or edit this proposal before accepting it.</p></div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => rejectSuggestion(section.id)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"><X className="h-3.5 w-3.5" /> Reject</button>
                        <button type="button" onClick={() => acceptSuggestion(section, index)} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"><Check className="h-3.5 w-3.5" /> Accept</button>
                      </div>
                    </div>
                    <textarea value={suggestions[section.id]} onChange={event => setSuggestions(current => ({ ...current, [section.id]: event.target.value }))} aria-label={`Suggested ${section.title} content`} rows={Math.max(4, Math.min(12, suggestions[section.id].split('\n').length + 2))} className="block w-full resize-y rounded-lg border border-blue-200 bg-white p-3 text-sm leading-6 text-gray-700 outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
      <p className="text-xs text-gray-500">Suggestions stay separate until you accept them. Accepted edits still require Save Changes and final human approval.</p>
    </div>
  );
}
