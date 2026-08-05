import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Seo from '../components/Seo.jsx';
import { buildFaqJsonLd } from '../data/structuredData.js';

const FAQS = [
  // General
  {
    category: 'General',
    q: 'What is FlacronAI?',
    a: 'FlacronAI is an AI-assisted insurance documentation platform. It organizes submitted claim details, notes, and supported damage photos into a structured draft that must be reviewed, edited, and approved by a qualified professional.',
  },
  {
    category: 'General',
    q: 'What types of claims does FlacronAI support?',
    a: 'FlacronAI provides draft workflows for Water Damage, Fire, Wind, Hail, Mold, Vandalism, and Other property-loss documentation. Users remain responsible for selecting the appropriate workflow, template, disclaimers, and professional review requirements for their role and jurisdiction.',
  },
  {
    category: 'General',
    q: 'What report types can I generate?',
    a: 'You can generate Initial, Supplemental, Final, and Re-Inspection report drafts. Your organization should verify that the selected template and final content meet its own carrier, client, contractual, and jurisdictional requirements.',
  },
  {
    category: 'General',
    q: 'Do reports include a watermark on the Starter plan?',
    a: 'Yes. Reports generated on the free Starter plan include a "FlacronAI" watermark. Upgrading to Professional, Agency, or Enterprise removes the watermark. Enterprise users can also set custom watermarks with their company name.',
  },
  {
    category: 'General',
    q: 'Is FlacronAI suitable for independent adjusters and large agencies?',
    a: 'Yes, FlacronAI is designed to scale. Individual adjusters use the Starter or Professional plans for personal productivity. Agencies use Agency or Enterprise plans for team-wide deployment, CRM integration, and branded portals.',
  },

  // Billing
  {
    category: 'Billing',
    q: 'What are the plan differences?',
    a: 'Starter: 5 reports/month with watermark. Professional ($39.99/mo): 50 reports, no watermark, and all export formats. Agency ($99.99/mo): 200 reports, CRM, and API-key access. Enterprise ($499/mo): unlimited reports, white-label portal, API-key access, and team management.',
  },
  {
    category: 'Billing',
    q: 'Can I cancel my subscription at any time?',
    a: 'Yes. You can cancel at any time from Settings > Billing > Cancel Subscription. Your plan remains active until the end of the current billing period. You will not be charged again after cancellation, and your account reverts to the free Starter plan.',
  },
  {
    category: 'Billing',
    q: 'Do unused reports roll over to the next month?',
    a: 'No. Monthly report allocations reset at the start of each billing cycle. Unused reports do not carry forward.',
  },
  {
    category: 'Billing',
    q: 'How does annual billing work?',
    a: 'Annual billing charges you for 12 months upfront at a 20% discount compared to monthly billing. For example, Professional is $31.99/month when billed annually instead of $39.99/month. You can switch between monthly and annual from the pricing page.',
  },
  {
    category: 'Billing',
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit and debit cards (Visa, MasterCard, American Express, Discover) through Stripe. We do not accept PayPal or cryptocurrency at this time.',
  },

  // Technical
  {
    category: 'Technical',
    q: 'What AI models does FlacronAI use?',
    a: 'FlacronAI uses Anthropic models for report drafting and supported-image analysis, with IBM watsonx available as a text-only fallback. Provider availability can vary by deployment. Every output remains an editable draft requiring professional review and approval.',
  },
  {
    category: 'Technical',
    q: 'How many photos can I upload per report?',
    a: 'You can upload up to 100 photos per report. Supported formats are JPEG and PNG. Individual files must be under 10MB. We recommend using a mixture of overview shots and detailed damage photos for best AI analysis results.',
  },
  {
    category: 'Technical',
    q: 'How long does report generation take?',
    a: 'Generation time varies with the amount of submitted documentation, supported photos, and current provider availability. The report appears in your dashboard when processing is complete.',
  },
  {
    category: 'Technical',
    q: 'What export formats are available?',
    a: 'Professional, Agency, and Enterprise plans can export in PDF, DOCX (Word), and HTML formats. Starter exports are limited and remain watermarked. Unapproved drafts are clearly marked as drafts on every plan.',
  },
  {
    category: 'Technical',
    q: 'Is my data stored securely?',
    a: 'Your account data and reports are stored in Google Cloud Firestore (via Firebase), which encrypts stored data at rest, and all traffic to the platform is encrypted in transit over HTTPS. Authentication is handled by Firebase Authentication. We do not use your report content or photos to train AI models.',
  },

  // API
  {
    category: 'API',
    q: 'Which plans include API access?',
    a: 'API-key access is available on Agency and Enterprise plans. Starter and Professional users access FlacronAI through the web application.',
  },
  {
    category: 'API',
    q: 'What can I do with the API?',
    a: 'The FlacronAI API supports programmatic report generation, report management (list, get, delete, export), CRM operations, user profile management, white-label configuration, and payment/subscription management.',
  },
  {
    category: 'API',
    q: 'Are there rate limits on the API?',
    a: 'Yes. All API traffic shares a fair-use limit of 100 requests per 15 minutes, and AI generation endpoints are limited to 10 requests per minute. Responses include standard rate-limit headers so your integration can back off gracefully.',
  },
  {
    category: 'API',
    q: 'Is there a white-label option for the platform?',
    a: 'Yes. Enterprise plan customers can configure white-labeling: a branded subdomain, company logo and colors, branded report headers and footers, watermark configuration, and the option to hide FlacronAI branding in the portal.',
  },
  {
    category: 'API',
    q: 'Does FlacronAI comply with GDPR and CCPA?',
    a: 'FlacronAI includes privacy controls and processes data as described in the Privacy Policy, but this statement is not a legal certification of compliance. Account deletion is available in Settings, subject to the retention terms described in the Privacy Policy. Organizations that require a DPA or jurisdiction-specific review should contact the sales team before use.',
  },
];

const CATEGORIES = ['All', 'General', 'Billing', 'Technical', 'API'];
const FAQ_JSONLD = buildFaqJsonLd(FAQS);

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-start justify-between gap-4 p-5 text-left hover:bg-gray-100 transition-colors">
        <span className="text-gray-900 text-sm font-medium leading-snug flex-1">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[#e5e7eb]">
            <p className="px-5 py-4 text-gray-600 text-sm leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQs() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const filtered = useMemo(() => {
    return FAQS.filter(f => {
      const matchCat = category === 'All' || f.category === category;
      const matchSearch = !search || f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [search, category]);

  return (
    <div className="min-h-screen bg-[#ffffff]">
      <Seo title="FAQs — FlacronAI" description="Answers about plans and report limits, export formats, API access, data security, and how AI-assisted insurance report drafting works." path="/faqs" jsonLd={FAQ_JSONLD} />
      <Navbar />
      <div className="pt-24 pb-20 px-4 max-w-3xl mx-auto">
        <motion.div className="text-center mb-12" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-orange-500/20 flex items-center justify-center">
            <HelpCircle className="w-7 h-7 text-orange-400" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Frequently Asked <span className="gradient-text">Questions</span></h1>
          <p className="text-gray-600">Find answers about FlacronAI, billing, features, and the API.</p>
        </motion.div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input className="input pl-10" placeholder="Search questions..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="flex gap-2 flex-wrap mb-8">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                category === cat ? 'bg-orange-500 text-gray-900' : 'bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200'}`}>
              {cat}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <HelpCircle className="w-8 h-8 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-600">No matching questions found. Try a different search term.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {CATEGORIES.filter(c => c !== 'All').map(cat => {
              const items = filtered.filter(f => f.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  {category === 'All' && (
                    <h2 className="text-xs font-semibold text-gray-500 uppercase px-1 mb-2 mt-6 first:mt-0">{cat}</h2>
                  )}
                  <div className="space-y-2">
                    {items.map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12 card p-6 text-center">
          <p className="text-gray-900 font-semibold mb-2">Still have questions?</p>
          <p className="text-gray-600 text-sm mb-4">Our support team is here to help with anything not covered above.</p>
          <Link to="/contact" className="btn-primary inline-flex items-center gap-2 text-sm py-2 px-6">Contact Support</Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
