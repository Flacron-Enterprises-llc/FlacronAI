import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Image, Cpu, Eye, ShieldCheck, Layers, Search, CheckCircle2 } from 'lucide-react';
import Navbar from '../components/Navbar.jsx';
import Footer from '../components/Footer.jsx';
import Seo from '../components/Seo.jsx';

const WORKFLOW = [
  {
    icon: Image,
    title: 'Upload up to 100 photos',
    desc: 'Add damage photos from the wizard — take a photo or choose from your library on mobile, or drag-and-drop on desktop. Duplicates are detected automatically, both within the batch and against photos already attached to the report.',
  },
  {
    icon: Cpu,
    title: 'Analyzed in batches, in the background',
    desc: 'Photos are processed automatically after upload — no separate step to trigger. Each photo is analyzed for visible conditions and gets a location, category, severity, and a plain-language observation.',
  },
  {
    icon: Eye,
    title: 'Review every finding',
    desc: 'Nothing reaches the draft unreviewed. Accept, edit, or exclude any AI-flagged observation, or add your own note — photo by photo, in a dedicated review UI.',
  },
  {
    icon: Layers,
    title: '3-tier photo storage',
    desc: 'The original upload is preserved untouched. A separate EXIF-normalized display copy and thumbnail are generated for viewing and export, so the source file is never permanently altered.',
  },
  {
    icon: Search,
    title: 'A searchable Photo Library',
    desc: 'Every analyzed photo across every report is filterable by claim, location, category, analysis status, and included/excluded state, with fast search and pagination.',
  },
  {
    icon: CheckCircle2,
    title: 'A deterministic photo appendix',
    desc: 'Reviewed photos and their observations appear as a consistent appendix in every PDF, DOCX, and HTML export — laid out 1, 2, or 4 per page.',
  },
];

export default function PhotoAnalysis() {
  return (
    <div className="min-h-screen bg-bg">
      <Seo
        title="Photo Analysis — FlacronAI"
        description="Upload up to 100 inspection photos per report. Each one is analyzed for visible conditions and reviewed by you before it becomes part of the report."
        path="/photo-analysis"
      />
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-600 text-sm font-medium mb-6">
              <Image className="w-3.5 h-3.5" />
              Photo Analysis
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-4">
              Analyze the Entire Inspection — Not Just the First Few Photos
            </h1>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto mb-8">
              Every one of the up to 100 photos you upload gets processed, not a sample. Every finding is
              reviewed by you before it becomes part of the draft.
            </p>
            <Link to="/signup" className="btn-primary inline-flex items-center gap-2">
              Try It Free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Illustrative batch/progress panel — a UI mock, not a screenshot */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto card p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-gray-700">Photo Batch</span>
            <span className="text-sm text-brand-600 font-semibold">100 photos</span>
          </div>
          <div className="grid grid-cols-10 gap-1.5 mb-6" aria-hidden="true">
            {Array.from({ length: 70 }).map((_, i) => (
              <div
                key={i}
                className={`aspect-square rounded ${
                  i < 55 ? 'bg-brand-500/70' : i < 64 ? 'bg-brand-500/30' : 'bg-gray-100'
                }`}
              />
            ))}
          </div>
          <div className="space-y-3">
            {[
              { label: 'Uploaded', pct: 100 },
              { label: 'Analyzed', pct: 91 },
              { label: 'Reviewed by you', pct: 55 },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{row.label}</span>
                  <span>{row.pct}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full" style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {WORKFLOW.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="card p-6"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-4">
                <item.icon className="w-5 h-5 text-brand-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h2>
              <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Limitations, stated plainly (Golden Rule #2) */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto rounded-card border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
          <p>
            <strong>What this doesn’t do:</strong> photo analysis flags visible conditions for your review — it
            does not determine cause of loss, coverage, liability, structural safety, code compliance, or final
            repair cost. A qualified professional must review and approve every finding.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="card p-12 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-amber-500/5" />
            <div className="relative">
              <h2 className="text-3xl font-black text-gray-900 mb-4">Try it on your next inspection</h2>
              <p className="text-gray-600 text-lg mb-8">No credit card required — 5 reports free every month.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup" className="btn-primary flex items-center justify-center gap-2">
                  Try It Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/features" className="btn-secondary flex items-center justify-center gap-2">
                  See All Features
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
