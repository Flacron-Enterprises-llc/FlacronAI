import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const markdownComponents = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-2 border-b border-gray-200 pb-3 text-2xl font-bold text-navy-800">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-7 rounded-lg border-l-4 border-brand-500 bg-brand-50 px-3 py-2 text-lg font-bold text-navy-800">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 text-base font-semibold text-gray-900">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="my-2 text-sm leading-6 text-gray-700">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="text-gray-600">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-6 text-sm text-gray-700">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-6 text-sm text-gray-700">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1 leading-6">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-r-lg border-l-4 border-amber-400 bg-amber-50 px-4 py-2 text-amber-900">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-gray-200" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-brand-600 underline decoration-brand-200 underline-offset-2 hover:text-brand-700"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-800">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-xl bg-navy-900 p-4 text-sm leading-6 text-gray-100">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <table className="my-4 w-full min-w-[560px] border-collapse text-left text-sm">
      {children}
    </table>
  ),
  thead: ({ children }) => <thead className="bg-gray-100 text-gray-800">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-gray-200 px-3 py-2 font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-200 px-3 py-2 align-top text-gray-700">{children}</td>
  ),
};

const ReportMarkdown = ({ content, className = '' }) => (
  <div className={`report-markdown overflow-x-auto ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content || ''}
    </ReactMarkdown>
  </div>
);

export default ReportMarkdown;
