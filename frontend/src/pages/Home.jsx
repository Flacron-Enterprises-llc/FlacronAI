import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  Zap, FileText, Image, Users, Globe, Code2, ArrowRight, Check,
  BarChart3, Lock, KeyRound, CreditCard, ServerCog, Star,
  CheckCircle, Download, Eye, Cpu, RefreshCw
} from 'lucide-react';
import Navbar from '../components/Navbar.jsx';
import Footer from '../components/Footer.jsx';
import TESTIMONIALS from '../data/testimonials.js';
import { PLAN_PRICING } from '../data/plans.js';
import { ORGANIZATION_JSONLD } from '../data/structuredData.js';
import Seo from '../components/Seo.jsx';

// ── Mock Dashboard UI ──────────────────────────────────────────────────────
const REPORT_LINES = [
  { type: 'h2', text: 'SECTION 5: DAMAGE ASSESSMENT' },
  { type: 'h3', text: 'Master Bathroom' },
  { type: 'p',  text: 'Visible buckling of subfloor beneath tile across approx. 38 sq ft. Conditions appear consistent with prolonged water exposure near the supply line — plumber confirmation recommended.' },
  { type: 'h3', text: 'Kitchen Ceiling' },
  { type: 'p',  text: 'Partial drywall collapse — approx. 40 sq ft section fallen. Joists visible with secondary water staining; professional structural assessment recommended.' },
  { type: 'h2', text: 'SECTION 7: ESTIMATED LOSS SUMMARY (DRAFT)' },
  { type: 'table', rows: [
    ['Category', 'Description', 'Cost'],
    ['Demo / Removal', 'Saturated materials', '$1,850'],
    ['Drywall', 'Ceiling & walls', '$3,200'],
    ['Flooring', 'Subfloor + hardwood', '$4,800'],
    ['Cabinetry', 'Base cabinets', '$2,600'],
    ['Paint & Finish', 'All affected rooms', '$1,400'],
    ['TOTAL', '', '$13,850'],
  ]},
];

const STEPS_ANIM = [
  { label: 'Uploading photos', icon: <Image className="w-3.5 h-3.5" />, done: true },
  { label: 'Analyzing damage with AI Vision', icon: <Eye className="w-3.5 h-3.5" />, done: true },
  { label: 'Generating report with FlacronAI', icon: <Cpu className="w-3.5 h-3.5" />, active: true },
  { label: 'Finalizing & scoring', icon: <CheckCircle className="w-3.5 h-3.5" />, done: false },
];

const DashboardMock = () => {
  const [phase, setPhase] = useState('form');  // 'form' | 'generating' | 'result'
  const [genStep, setGenStep] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    // Auto-cycle the demo
    const cycle = () => {
      setPhase('form');
      setGenStep(0);
      setVisibleLines(0);

      const t1 = setTimeout(() => setPhase('generating'), 2200);
      const t2 = setTimeout(() => setGenStep(1), 3600);
      const t3 = setTimeout(() => setGenStep(2), 5000);
      const t4 = setTimeout(() => setGenStep(3), 6400);
      const t5 = setTimeout(() => { setPhase('result'); setVisibleLines(0); }, 7600);

      // Reveal report lines one by one
      let lineTimer = 7800;
      REPORT_LINES.forEach((_, i) => {
        setTimeout(() => setVisibleLines(i + 1), lineTimer);
        lineTimer += 320;
      });

      return [t1, t2, t3, t4, t5];
    };

    const timers = cycle();
    const loopTimer = setInterval(() => {
      timers.forEach(clearTimeout);
      cycle();
    }, 18000);

    return () => { timers.forEach(clearTimeout); clearInterval(loopTimer); };
  }, []);

  return (
    <div className="relative w-full select-none" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Browser chrome */}
      <div className="rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/10 border border-gray-200">
        {/* Tab bar */}
        <div className="bg-gray-100 px-4 py-2.5 flex items-center gap-3 border-b border-gray-200">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-gray-400 border border-gray-200 max-w-xs mx-auto text-center">
            app.flacronai.com/dashboard
          </div>
        </div>

        {/* App header */}
        <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo-mark.png" alt="" className="w-6 h-6 object-contain" />
            <span className="font-bold text-sm text-gray-900">FlacronAI</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-gray-500">AI Online</span>
          </div>
        </div>

        {/* Dashboard body */}
        <div className="bg-[#f8f8f8] flex" style={{ minHeight: 340 }}>
          {/* Sidebar */}
          <div className="w-36 bg-white border-r border-gray-100 px-2 py-3 flex flex-col gap-0.5 shrink-0">
            {[
              { label: 'Generate', icon: Zap, active: true },
              { label: 'My Reports', icon: FileText },
              { label: 'Usage', icon: BarChart3 },
            ].map(item => (
              <div key={item.label}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  item.active
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}>
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                {item.label}
              </div>
            ))}
            <div className="mt-auto pt-3 border-t border-gray-100">
              <div className="text-[10px] text-gray-400 mb-1 px-1">This month</div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mx-1">
                <div className="h-full bg-orange-500 rounded-full" style={{ width: '40%' }} />
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5 px-1">8 / 20 reports</div>
            </div>
          </div>

          {/* Main panel */}
          <div className="flex-1 p-3 overflow-hidden">
            <AnimatePresence mode="wait">

              {/* PHASE: Form */}
              {phase === 'form' && (
                <motion.div key="form"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700">New Report</p>
                    <div className="flex gap-1">
                      {['💧','🔥','🌪️','🔨'].map((e, i) => (
                        <div key={i} className={`text-xs px-2 py-0.5 rounded-md border cursor-pointer transition-colors ${
                          i === 0 ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-gray-200 text-gray-400'
                        }`}>{e}</div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    {[
                      { l: 'Claim Number', v: 'CLM-2024-WD-001' },
                      { l: 'Insured Name',  v: 'John & Mary Smith' },
                      { l: 'Loss Type',     v: 'Water Damage', select: true },
                      { l: 'Loss Date',     v: 'Jan 15, 2024', date: true },
                      { l: 'Property Address', v: '1425 Maple Street, Austin TX', full: true },
                    ].map(f => (
                      <div key={f.l} className={f.full ? 'col-span-2' : ''}>
                        <div className="text-[9px] text-gray-400 mb-0.5 font-medium uppercase tracking-wide">{f.l}</div>
                        <div className={`text-xs px-2 py-1.5 rounded-lg border text-gray-700 bg-white ${
                          f.select ? 'border-orange-300 text-orange-600 font-medium' : 'border-gray-200'
                        }`}>{f.v}</div>
                      </div>
                    ))}
                  </div>
                  {/* Animate "typing" into description */}
                  <div>
                    <div className="text-[9px] text-gray-400 mb-0.5 font-medium uppercase tracking-wide">Loss Description</div>
                    <div className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 min-h-[30px] relative">
                      <motion.span
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 2, delay: 0.4, ease: 'linear' }}
                        className="overflow-hidden whitespace-nowrap inline-block"
                      >
                        Upstairs bathroom supply line failed overnight, water flowed 6–8 hours...
                      </motion.span>
                      <span className="inline-block w-0.5 h-3 bg-orange-400 align-middle ml-0.5 animate-pulse" />
                    </div>
                  </div>
                  <motion.button
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}
                    className="w-full bg-orange-500 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" fill="white" /> Generate Report with AI
                  </motion.button>
                </motion.div>
              )}

              {/* PHASE: Generating */}
              {phase === 'generating' && (
                <motion.div key="gen"
                  initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center justify-center h-full gap-4 py-4"
                >
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-200 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-orange-500 animate-pulse" />
                  </div>
                  <p className="text-sm font-bold text-gray-800">Generating Your Report</p>
                  <div className="w-full max-w-xs space-y-2">
                    {STEPS_ANIM.map((s, i) => (
                      <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all duration-500 ${
                        i < genStep ? 'bg-green-50 text-green-600 border border-green-100' :
                        i === genStep ? 'bg-orange-50 text-orange-600 border border-orange-200' :
                        'bg-gray-50 text-gray-400 border border-gray-100'
                      }`}>
                        {i < genStep
                          ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                          : i === genStep
                            ? <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
                            : <div className="w-3.5 h-3.5 rounded-full border border-current shrink-0" />
                        }
                        {s.label}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* PHASE: Result */}
              {phase === 'result' && (
                <motion.div key="result"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col gap-2"
                >
                  {/* Top bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-xs font-bold text-gray-700">Report Generated</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100">
                        Quality 94/100
                      </span>
                      <div className="flex gap-1">
                        {['PDF', 'DOCX', 'HTML'].map(f => (
                          <div key={f} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 cursor-pointer hover:bg-orange-50 hover:text-orange-500 hover:border-orange-200 transition-colors">
                            <Download className="w-2.5 h-2.5" /> {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Report content */}
                  <div className="flex-1 bg-white rounded-xl border border-gray-200 p-3 overflow-hidden">
                    <div className="space-y-1.5">
                      {REPORT_LINES.slice(0, visibleLines).map((line, i) => (
                        <motion.div key={i}
                          initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2 }}>
                          {line.type === 'h2' && (
                            <div className="text-[10px] font-bold px-2 py-1 rounded-md text-white mt-1" style={{ background: '#f97316' }}>
                              {line.text}
                            </div>
                          )}
                          {line.type === 'h3' && (
                            <div className="text-[10px] font-bold text-gray-700 mt-0.5">{line.text}</div>
                          )}
                          {line.type === 'p' && (
                            <div className="text-[9px] text-gray-500 leading-relaxed">{line.text}</div>
                          )}
                          {line.type === 'table' && (
                            <div className="rounded-md overflow-hidden border border-gray-100 mt-1">
                              {line.rows.map((row, ri) => (
                                <div key={ri} className={`flex text-[9px] ${
                                  ri === 0 ? 'font-bold text-white' :
                                  ri === line.rows.length - 1 ? 'font-bold text-gray-800 bg-orange-50' :
                                  ri % 2 === 0 ? 'text-gray-600 bg-gray-50' : 'text-gray-600 bg-white'
                                }`}
                                  style={ri === 0 ? { background: '#f97316' } : {}}>
                                  {row.map((cell, ci) => (
                                    <div key={ci} className={`px-2 py-1 ${ci === 0 ? 'flex-1' : ci === 1 ? 'flex-1' : 'w-16 text-right'}`}>
                                      {cell}
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      ))}
                      {/* Cursor blink while content is loading */}
                      {visibleLines < REPORT_LINES.length && (
                        <div className="inline-block w-1 h-3 bg-orange-400 rounded-sm animate-pulse ml-1" />
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
        className="absolute -top-4 -right-4 bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-200 flex items-center gap-2"
      >
        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <Cpu className="w-4 h-4 text-blue-500" />
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Powered by</p>
          <p className="text-xs font-bold text-gray-800">FlacronAI Engine</p>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, 7, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', delay: 1.5 }}
        className="absolute -bottom-4 -left-4 bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-200 flex items-center gap-2"
      >
        <div className="w-7 h-7 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
          <CheckCircle className="w-4 h-4 text-green-500" />
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Draft ready</p>
          <p className="text-xs font-bold text-gray-800">for your review</p>
        </div>
      </motion.div>
    </div>
  );
};

// Animated counter
const Counter = ({ end, suffix = '' }) => {
  const [count, setCount] = useState(0);
  const ref = useRef();
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = end / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, end]);
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
};

const features = [
  { icon: Zap, title: 'AI Report Generation', desc: 'FlacronAI drafts complete, consistently structured inspection reports in minutes — ready for your review.', color: 'from-orange-500 to-amber-500' },
  { icon: FileText, title: 'Multi-Format Export', desc: 'Export professional PDFs with custom branding, editable DOCX files, and embeddable HTML.', color: 'from-orange-500 to-cyan-500' },
  { icon: Image, title: 'AI Image Analysis', desc: 'Upload up to 100 damage photos. AI Vision analyzes each one and integrates findings into the report.', color: 'from-emerald-500 to-teal-500' },
  { icon: Users, title: 'CRM Integration', desc: 'Manage clients, schedule inspections, track claims — all linked to your reports automatically.', color: 'from-orange-500 to-amber-500' },
  { icon: Globe, title: 'White-Label Portal', desc: 'Enterprise clients get a fully branded portal with a custom subdomain, logo, colors, and report footer.', color: 'from-pink-500 to-rose-500' },
  { icon: Code2, title: 'Developer API', desc: 'REST API with API key authentication. Integrate FlacronAI into your existing claim management system.', color: 'from-violet-500 to-orange-500' },
];

const steps = [
  { num: '01', title: 'Upload & Fill Details', desc: 'Enter claim information and upload up to 100 damage photos. Takes less than 2 minutes.' },
  { num: '02', title: 'AI Generates Draft', desc: 'FlacronAI analyzes your inputs and each photo, then assembles a structured draft report in minutes.' },
  { num: '03', title: 'Export & Share', desc: 'Download as PDF with your logo, export to DOCX, or share a secure link. Watermark-free on paid plans.' },
];

const Home = () => {
  const location = useLocation();

  useEffect(() => {
    if (location.state?.scrollTo) {
      const el = document.getElementById(location.state.scrollTo);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <Seo title="FlacronAI — AI-Assisted Insurance Inspection Reports" description="Draft professional insurance inspection reports in minutes. AI assembles the draft from your claim details and damage photos — you review and approve. Start free." path="/" jsonLd={ORGANIZATION_JSONLD} />
      <Navbar transparent />

      {/* Hero */}
      <section className="relative flex items-center overflow-hidden pt-16">
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -left-40 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl animate-blob" />
          <div className="absolute top-1/3 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-orange-500/8 rounded-full blur-3xl animate-blob animation-delay-4000" />
        </div>

        {/* Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(249,115,22,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-600 text-sm font-medium mb-6">
                <Zap className="w-3.5 h-3.5" />
                AI-assisted reporting for insurance professionals
              </div>
              <h1 className="text-4xl lg:text-5xl xl:text-6xl font-black text-gray-900 leading-tight tracking-tight mb-6">
                Generate Professional Insurance Inspection Reports{' '}
                <span className="gradient-text">in Minutes</span>
              </h1>
              <p className="text-xl text-gray-600 leading-relaxed mb-8 max-w-lg">
                FlacronAI assembles a structured draft report from your claim details and damage photos — you review, refine, and approve the final report. Built for independent adjusters, agencies, and TPA teams.
              </p>
              <div className="flex flex-wrap gap-4 mb-10">
                <Link to="/auth?mode=signup" className="btn-primary flex items-center gap-2">
                  Generate My First Report Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a href="/sample-report.pdf" target="_blank" rel="noopener" className="btn-secondary flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  View Sample Report
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500">
                {['No credit card required', '5 reports free/month', 'You approve every report', 'PDF & DOCX export', 'Cancel anytime'].map(item => (
                  <span key={item} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    {item}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* Dashboard Demo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="hidden lg:block relative"
            >
              <DashboardMock />
            </motion.div>
          </div>
        </div>

      </section>

      {/* Stats Bar */}
      <section className="border-y border-[#e5e7eb] bg-[#f8f8f8]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {/* Product facts only — verifiable from the codebase (Golden Rule #1) */}
            {[
              { label: 'Damage Photos per Report', value: 100, suffix: '' },
              { label: 'Report Sections per Draft', value: 9, suffix: '' },
              { label: 'Export Formats', value: 3, suffix: '' },
              { label: 'Subscription Tiers', value: 4, suffix: '' },
            ].map(({ label, value, suffix }) => (
              <div key={label} className="text-center">
                <div className="flex items-center justify-center gap-1 text-3xl font-black text-gray-900 mb-1">
                  <Counter end={value} suffix={suffix} />
                </div>
                <p className="text-gray-500 text-sm">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product showcase — real UI (T-1.5) */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-4xl font-black text-gray-900 mb-4">The Actual Product, Not a Mockup</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              A five-step guided wizard takes you from claim details and damage photos to a structured draft report ready for your review.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-gradient-to-br from-brand-500/10 via-transparent to-navy-500/10 rounded-3xl blur-xl pointer-events-none" />
            <div className="relative rounded-card overflow-hidden border border-border shadow-card bg-white">
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
            </div>
          </motion.div>
          <p className="text-center text-sm text-gray-500 mt-6">
            Want to see the output?{' '}
            <a href="/sample-report.pdf" download className="text-brand-600 font-medium hover:underline">
              Download the sample report (PDF)
            </a>{' '}
            — fictional data, real structure and language.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm mb-4">
            Everything you need
          </div>
          <h2 className="text-4xl font-black text-gray-900 mb-4">
            Built for Insurance Professionals
          </h2>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            From independent adjusters to enterprise TPAs — FlacronAI scales with your workflow.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="card p-6 hover:border-orange-500/30 transition-all duration-300 group"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                <feature.icon className="w-5 h-5 text-gray-900" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-[#f8f8f8]/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-black text-gray-900 mb-4">How It Works</h2>
            <p className="text-gray-600 text-lg">Three steps from photos to professional report</p>
          </motion.div>

          <div className="relative">
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent -translate-y-1/2" />
            <div className="grid md:grid-cols-3 gap-8">
              {steps.map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="relative text-center"
                >
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-orange-500/20">
                    <span className="text-gray-900 font-black text-lg">{step.num}</span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="text-center mt-12">
            <Link to="/auth?mode=signup" className="btn-primary inline-flex items-center gap-2">
              Try It Free Now
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-black text-gray-900 mb-4">Simple, Transparent Pricing</h2>
          <p className="text-gray-600 text-lg">Start free. Upgrade when you need more.</p>
        </motion.div>

        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {[
            { tier: 'Starter', price: PLAN_PRICING.starter.monthly, reports: 5, features: ['5 reports/month', 'PDF export', 'Watermarked'], highlight: false },
            { tier: 'Professional', price: PLAN_PRICING.professional.monthly, reports: 50, features: ['50 reports/month', 'PDF, DOCX + HTML export', 'No watermark', 'Priority support'], highlight: true },
            { tier: 'Agency', price: PLAN_PRICING.agency.monthly, reports: 200, features: ['200 reports/month', 'API access', 'CRM module', 'Custom logo on reports'], highlight: false },
            { tier: 'Enterprise', price: PLAN_PRICING.enterprise.monthly, reports: '∞', features: ['Unlimited reports', 'White-label portal', 'Custom subdomain', 'Dedicated support'], highlight: false },
          ].map((plan, i) => (
            <motion.div
              key={plan.tier}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`card p-6 relative ${plan.highlight ? 'border-orange-500 shadow-xl shadow-orange-500/10' : ''}`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-orange-500 rounded-full text-xs font-semibold text-gray-900">
                  Most Popular
                </div>
              )}
              <h3 className="font-bold text-gray-900 mb-1">{plan.tier}</h3>
              <div className="flex items-end gap-1 mb-4">
                <span className="text-3xl font-black text-gray-900">${plan.price === 0 ? '0' : plan.price}</span>
                {plan.price > 0 && <span className="text-gray-500 text-sm mb-1">/mo</span>}
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to={plan.price === 0 ? '/auth?mode=signup' : '/pricing'} className={`block text-center text-sm py-2 rounded-lg font-medium transition-colors ${plan.highlight ? 'bg-primary hover:bg-primary-hover text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200'}`}>
                {plan.price === 0 ? 'Get Started Free' : 'Get Started'}
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <Link to="/pricing" className="text-orange-400 hover:text-orange-300 text-sm font-medium flex items-center gap-1 justify-center">
            View full pricing & feature comparison
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Testimonials — renders ONLY when real, approved feedback exists (Golden Rule #1) */}
      {TESTIMONIALS.length > 0 && (
        <section className="py-24 bg-[#f8f8f8]/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl font-black text-gray-900 mb-4">What Customers Say</h2>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t, i) => (
                <motion.div
                  key={`${t.name}-${t.date}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="card p-6"
                >
                  {t.rating > 0 && (
                    <div className="flex items-center gap-1 mb-4">
                      {[...Array(t.rating)].map((_, j) => (
                        <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                  )}
                  <p className="text-gray-700 text-sm leading-relaxed mb-4">"{t.benefit}"</p>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-gray-900 font-semibold text-sm">{t.name}</p>
                      <p className="text-gray-500 text-xs">
                        {t.role}
                        {t.reportType ? ` · ${t.reportType} reports` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {t.verified && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                          <CheckCircle className="w-3 h-3" /> Verified
                        </span>
                      )}
                      {t.date && <p className="text-gray-400 text-[11px] mt-0.5">{t.date}</p>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trust & security — verifiable facts only, no compliance badges (Golden Rule #6) */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface border-y border-border">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl font-black text-gray-900 mb-3">Security, Stated Plainly</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              No badge wall — just what the platform actually does today.
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Lock, title: 'Encrypted in Transit', desc: 'All traffic between your browser and FlacronAI runs over HTTPS.' },
              { icon: KeyRound, title: 'Firebase Authentication', desc: 'Sign-in handled by Google’s Firebase Auth — email/password or Google account. Passwords are never stored by us.' },
              { icon: CreditCard, title: 'Stripe-Hosted Payments', desc: 'Checkout and card handling happen on Stripe. Card numbers never touch FlacronAI servers.' },
              { icon: ServerCog, title: 'Server-Side Plan Limits', desc: 'Report limits and plan features are enforced on the server, not in the browser — covered by automated tests.' },
            ].map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="bg-white border border-border rounded-card p-5"
              >
                <div className="w-10 h-10 rounded-xl bg-navy-800/5 border border-navy-800/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-navy-700" />
                </div>
                <h3 className="text-gray-900 font-semibold mb-1.5">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="card p-12 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-amber-500/5" />
              <div className="relative">
                <h2 className="text-4xl font-black text-gray-900 mb-4">
                  Ready to Transform Your Workflow?
                </h2>
                <p className="text-gray-600 text-lg mb-8">
                  Draft professional inspection reports with AI — you review and approve every finding before it ships.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/auth?mode=signup" className="btn-primary flex items-center justify-center gap-2">
                    Start Free Today
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link to="/contact" className="btn-secondary flex items-center justify-center gap-2">
                    Talk to Sales
                  </Link>
                </div>
                <p className="text-gray-600 text-sm mt-4">No credit card required · Free forever plan available</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;
