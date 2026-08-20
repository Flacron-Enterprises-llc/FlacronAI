import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Zap, Image, PenSquare, LayoutTemplate, FileText, ShieldCheck,
  Users, Globe, Code2, BarChart3, Lock,
} from 'lucide-react';
import Navbar from '../components/Navbar.jsx';
import Footer from '../components/Footer.jsx';
import Seo from '../components/Seo.jsx';

// Phase 23: every claim below is a real, already-shipped capability
// (Golden Rule #1) — no invented integrations/certifications/accuracy figures.
const FEATURE_SECTIONS = [
  {
    icon: Zap,
    title: 'Automated Report Drafting',
    desc: 'Enter claim, property, and loss details once. The FLACRON ENGINE organizes them — along with your submitted photos and documentation — into a structured draft report.',
    bullets: [
      'Structured report sections generated automatically',
      'Runs as a background job — no waiting on a blocking request',
      'Every draft is clearly labeled pending review until a reviewer approves it',
    ],
  },
  {
    icon: Image,
    title: 'Photo Analysis',
    desc: 'Upload up to 100 damage photos per report. Each one is analyzed for visible conditions and made available for structured, per-photo review.',
    bullets: [
      'Location, category, severity, and observation per photo',
      'Accept, edit, exclude, or add a note to any AI-flagged observation',
      'Original photo preserved untouched alongside an optimized display copy and thumbnail',
    ],
    link: { to: '/photo-analysis', label: 'See the full photo analysis workflow' },
  },
  {
    icon: PenSquare,
    title: 'Rich-Text Report Editor',
    desc: 'A full editor — formatting, tables, photo inserts, page breaks, section add/delete/reorder — plus FLACRON ENGINE writing assistance for individual sections.',
    bullets: [
      'Improve, shorten, expand, and rewrite section text on demand',
      'Regenerate a section with your own instructions and compare before/after',
      'Undo/redo and autosave while you edit',
    ],
  },
  {
    icon: LayoutTemplate,
    title: 'Report Templates',
    desc: 'Build reusable, structural templates so every report starts from your organization’s standard format instead of a blank draft.',
    bullets: [
      'Personal, organization, and Flacron-provided template scopes',
      'Required-field validation enforced at generation time',
      'Export-time photo layout and branding defaults per template',
    ],
  },
  {
    icon: FileText,
    title: 'Multi-Format Export',
    desc: 'Export a finished report to PDF, DOCX, or HTML — with cover page, captions, page numbers, and a photo appendix, all configurable.',
    bullets: [
      'PDF, DOCX, and HTML export from the same report content',
      'Draft exports are watermarked until a reviewer approves the report',
      'Secure, permission-leveled, optionally-expiring share links',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Team Roles & Permissions',
    desc: 'Seven roles — Owner, Admin, Manager, Adjuster, Inspector, Reviewer, Viewer — with who can generate, edit, approve, and export enforced on the server.',
    bullets: [
      'Least-privilege permissions matrix, not just hidden UI buttons',
      'Immediate suspension revokes active sessions, not just future logins',
      'A dedicated Organization admin view for Members, Templates, and Usage',
    ],
  },
  {
    icon: Users,
    title: 'CRM & Claims',
    desc: 'Manage clients, schedule inspections, and track claims — with reports linked automatically to the claim they belong to.',
    bullets: [
      'A claim workspace with linked reports and analyzed photos',
      'Client and appointment management for Agency and above',
      'Real search and filtering across claims and clients',
    ],
  },
  {
    icon: Globe,
    title: 'White-Label Portal',
    desc: 'Enterprise clients get a fully branded portal — logo, colors, and report footer — for their own team or adjuster network.',
    bullets: [
      'Custom logo, brand colors, and report footer text',
      'A dedicated onboarding flow for enterprise subdomains',
      'Branding applied consistently across PDF, DOCX, and HTML exports',
    ],
  },
  {
    icon: Code2,
    title: 'Developer API',
    desc: 'A REST API secured by API keys, with rate limiting and HMAC-signed webhooks for report and analysis events.',
    bullets: [
      'API key management with one-time secret reveal',
      'Register, list, rotate, and delete webhooks yourself',
      'Full endpoint reference in the API documentation',
    ],
  },
  {
    icon: BarChart3,
    title: 'Usage Analytics',
    desc: 'Reports generated, photos analyzed, completion time, and usage over time — organization-wide for Enterprise, personal for everyone else.',
    bullets: [
      'Real Firestore-backed metrics, not estimates',
      '7/30/90/365-day, all-time, and custom date-range filtering',
      'Per-member breakdown for Owners, Admins, and Managers',
    ],
  },
  {
    icon: Lock,
    title: 'Security & Server-Side Entitlements',
    desc: 'Plan limits and role permissions are enforced on the server, not the browser, and every admin/security action is written to an audit log.',
    bullets: [
      'TLS in transit, AES-256 at rest via Firebase',
      'Opt-in TOTP multi-factor authentication',
      'A filterable, paginated audit log viewer for Enterprise organizations',
    ],
    link: { to: '/security', label: 'Read the full security page' },
  },
];

export default function Features() {
  return (
    <div className="min-h-screen bg-bg">
      <Seo
        title="Features — FlacronAI"
        description="Automated report drafting, full-photo-set analysis, a rich-text editor with AI writing assistance, templates, CRM, white-label, a developer API, analytics, and server-enforced security."
        path="/features"
      />
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-4">
              Everything You Need to Draft a Report
            </h1>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto mb-8">
              From claim details and up to 100 photos to a reviewed, exported report — every step below is
              part of the actual product, not a roadmap item.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/signup" className="btn-primary inline-flex items-center gap-2">
                Try It Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/pricing" className="btn-secondary inline-flex items-center gap-2">
                See Pricing
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Real product screenshot */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-card overflow-hidden border border-border shadow-card bg-white"
          >
            <div className="flex items-center gap-1.5 px-4 py-2.5 bg-surface border-b border-border">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 text-xs text-gray-400 truncate">app.flacronai.com/dashboard</span>
            </div>
            <img
              src="/product-generate-report.webp"
              alt="FlacronAI dashboard showing the five-step Generate Report wizard with claim information filled in"
              loading="lazy"
              width="2400"
              height="1500"
              className="w-full h-auto"
            />
          </motion.div>
        </div>
      </section>

      {/* Feature sections */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-6">
          {FEATURE_SECTIONS.map((section, i) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 2) * 0.08 }}
              className="card p-6"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-4">
                <section.icon className="w-5 h-5 text-brand-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">{section.title}</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">{section.desc}</p>
              <ul className="space-y-2 mb-2">
                {section.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
              {section.link && (
                <Link
                  to={section.link.to}
                  className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800 text-sm font-medium mt-2"
                >
                  {section.link.label}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="card p-12 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-amber-500/5" />
            <div className="relative">
              <h2 className="text-3xl font-black text-gray-900 mb-4">Ready to see it on your own claim?</h2>
              <p className="text-gray-600 text-lg mb-8">
                Start free — no credit card required, and you approve every report before it ships.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup" className="btn-primary flex items-center justify-center gap-2">
                  Try It Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/solutions" className="btn-secondary flex items-center justify-center gap-2">
                  Find Your Solution
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
