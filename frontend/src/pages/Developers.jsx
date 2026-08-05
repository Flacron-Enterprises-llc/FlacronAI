import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Code, Key, Webhook, ArrowRight, Copy, Check, Terminal, BookOpen, Shield, BarChart2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Seo from '../components/Seo.jsx';

const CURL_EXAMPLE = `curl -X POST https://YOUR_API_BASE_URL/api/reports/generate \\
  -H "X-API-Key: flac_live_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: multipart/form-data" \\
  -F "claimNumber=CLM-2024-001" \\
  -F "insuredName=John Smith" \\
  -F "propertyAddress=123 Main St, Tampa, FL 33601" \\
  -F "lossDate=2024-01-15" \\
  -F "lossType=Water Damage" \\
  -F "reportType=Initial" \\
  -F "photos=@kitchen_damage.jpg" \\
  -F "photos=@bathroom_damage.jpg"`;

const RESPONSE_EXAMPLE = `{
  "report": {
    "_id": "64f8abc123def456",
    "claimNumber": "CLM-2024-001",
    "insuredName": "John Smith",
    "lossType": "Water Damage",
    "status": "completed",
    "qualityScore": 94,
    "aiModel": "FlacronAI",
    "content": "INSURANCE CLAIM REPORT\\n\\nClaim Number: CLM-2024-001\\n...",
    "createdAt": "2024-01-16T10:30:00.000Z"
  }
}`;

const STEPS = [
  {
    step: '01',
    title: 'Get Your API Key',
    desc: 'Sign up for an Agency or Enterprise plan and navigate to Settings > API Keys. Create a named key for your application. The key is shown once — store it securely.',
    code: `# Store securely as an environment variable
export FLACRON_API_KEY="flac_live_xxxxxxxxxxxx"`,
    icon: Key,
  },
  {
    step: '02',
    title: 'Make Your First Request',
    desc: 'Pass your API key in the X-API-Key header to authenticate integration requests. Generate your first report by sending claim data and damage photos.',
    code: CURL_EXAMPLE,
    icon: Terminal,
  },
  {
    step: '03',
    title: 'Handle the Response',
    desc: 'The API returns a structured report object with the AI-generated content, quality score, and metadata. Generation time depends on the number of photos submitted.',
    code: RESPONSE_EXAMPLE,
    icon: Code,
  },
];

const FEATURES = [
  {
    icon: Code,
    title: 'RESTful API',
    desc: 'Clean, predictable REST endpoints with JSON responses. Supports multipart/form-data for photo uploads. Comprehensive error messages with HTTP status codes.',
    color: 'text-orange-400 bg-orange-500/10',
  },
  {
    icon: Key,
    title: 'API Keys',
    desc: 'Create multiple named API keys for different environments (dev, staging, production). Keys are stored hashed and can be revoked instantly from the dashboard.',
    color: 'text-amber-400 bg-amber-500/10',
  },
  {
    icon: BarChart2,
    title: 'Rate Limiting',
    desc: 'Fair-use limits keep the platform responsive: 100 requests per 15 minutes API-wide and 10 per minute on AI generation endpoints, with standard rate-limit headers on every response.',
    color: 'text-orange-400 bg-orange-500/10',
  },
  {
    icon: Webhook,
    title: 'Multi-Format Export',
    desc: 'Generate a report once, export it as PDF, DOCX, or HTML through the export endpoint — the same formats available in the dashboard.',
    color: 'text-green-400 bg-green-500/10',
  },
  {
    icon: Shield,
    title: 'Secure by Design',
    desc: 'All API traffic runs over HTTPS. Every request is authenticated with Firebase Auth or an API key, and stored keys are SHA-256 hashed — never kept in plain text.',
    color: 'text-amber-400 bg-amber-500/10',
  },
  {
    icon: BookOpen,
    title: 'Full Documentation',
    desc: 'Complete API reference with request/response schemas, code examples in cURL, JavaScript, and Python, rate limit tables, and error code explanations.',
    color: 'text-red-400 bg-red-500/10',
  },
];

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative">
      <pre className="bg-gray-300 border border-gray-200 rounded-xl p-4 overflow-x-auto text-xs font-mono leading-relaxed text-green-300">
        <code>{code}</code>
      </pre>
      <button onClick={handleCopy} className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-gray-900 transition-colors">
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function Developers() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#ffffff]">
      <Seo title="Developer API — FlacronAI" description="Integrate AI-assisted insurance report generation into your tools: REST API with API-key auth, JSON responses, and PDF, DOCX and HTML export." path="/developers" />
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-20 px-4 text-center">
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-medium mb-6">
            <Code className="w-4 h-4" /> Developer Platform
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Build with the <span className="gradient-text">FlacronAI API</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto mb-10">
            Integrate AI-powered insurance claim report generation directly into your applications. REST API, API keys, multi-format export, and full documentation.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button onClick={() => navigate('/docs/api')} className="btn-primary flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> View API Docs <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => navigate('/pricing')} className="btn-secondary flex items-center gap-2">
              Get API Access
            </button>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div className="flex flex-wrap justify-center gap-8 mt-16"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          {/* Verifiable product facts only (Golden Rule #1) */}
          {[
            { label: 'Auth Methods', value: '2' },
            { label: 'Export Formats', value: '3' },
            { label: 'Photos per Report', value: '100' },
            { label: 'Response Format', value: 'JSON' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-gray-500 text-sm mt-0.5">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Quick Start */}
      <section className="py-20 px-4 bg-[#f8f8f8] border-y border-[#e5e7eb]">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Quick Start Guide</h2>
            <p className="text-gray-600">Follow the authenticated workflow to create and retrieve an AI-assisted draft report.</p>
          </motion.div>

          <div className="space-y-8">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div key={i} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start"
                  initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}>
                  <div className={`${i % 2 === 1 ? 'lg:order-2' : ''}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl font-black text-gray-900/10">{step.step}</span>
                      <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-orange-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                    </div>
                    <p className="text-gray-600 text-sm leading-relaxed">{step.desc}</p>
                  </div>
                  <div className={`${i % 2 === 1 ? 'lg:order-1' : ''}`}>
                    <CodeBlock code={step.code} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Developer-First Platform</h2>
            <p className="text-gray-600">Everything you need to build a production-ready integration.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div key={i} className="card p-5"
                  initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                  <div className={`w-10 h-10 rounded-xl ${f.color.split(' ')[1]} flex items-center justify-center mb-4`}>
                    <Icon className={`w-5 h-5 ${f.color.split(' ')[0]}`} />
                  </div>
                  <h3 className="text-gray-900 font-semibold mb-2">{f.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-[#f8f8f8] border-t border-[#e5e7eb]">
        <motion.div className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to Build?</h2>
          <p className="text-gray-600 mb-8">API-key access is available on Agency and Enterprise plans. Start with the docs, then choose the plan that matches your integration needs.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button onClick={() => navigate('/docs/api')} className="btn-primary flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Read the Docs
            </button>
            <button onClick={() => navigate('/pricing')} className="btn-secondary flex items-center gap-2">
              View API Plans <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
}
