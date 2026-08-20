import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Zap, Target, Shield, Smile, Building2, Heart } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Seo from '../components/Seo.jsx';

const VALUES = [
  {
    icon: Zap, title: 'Speed',
    desc: 'We believe every hour an adjuster spends writing is an hour not spent helping people. We obsess over reducing the time between inspection and submission.',
  },
  {
    icon: Target, title: 'Accuracy',
    desc: 'Drafts are structured and consistent, and built for human review. We measure and improve output quality constantly, because a wrong report doesn\'t just waste time — it damages trust.',
  },
  {
    icon: Shield, title: 'Security',
    desc: 'Insurance data is sensitive. We encrypt traffic in transit, control access to your files, and never sell or share your data. Your data stays yours.',
  },
  {
    icon: Smile, title: 'Simplicity',
    desc: 'We built the product we wished existed — no bloat, no confusing workflows. From claim details to generated report in five guided steps. That\'s it.',
  },
  {
    icon: Building2, title: 'Enterprise-Grade',
    desc: 'Whether you\'re an independent adjuster or a national agency, the platform scales to your needs. Custom branding, white-label portals, and team management.',
  },
  {
    icon: Heart, title: 'Customer First',
    desc: 'Our highest-priority features come from customer feedback. Our Enterprise clients get dedicated support and direct lines to our engineering team.',
  },
];

export default function About() {
  return (
    <div className="min-h-screen bg-bg">
      <Seo title="About FlacronAI — Give Adjusters Their Time Back" description="FlacronAI, a Flacron Enterprises LLC product, removes the documentation bottleneck in insurance claims: the FLACRON ENGINE drafts the report, a licensed adjuster reviews and approves." path="/about" />
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 px-4 text-center">
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm font-medium mb-6">
            About Us
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Give Adjusters Their <span className="gradient-text">Time Back</span>
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed">
            FlacronAI exists to eliminate the documentation bottleneck in insurance claims. We combine the FLACRON ENGINE with deep industry knowledge to give adjusters their time back.
          </p>
        </motion.div>
      </section>

      {/* Why we exist */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Why FlacronAI Exists</h2>
            <div className="space-y-5 text-gray-600 leading-relaxed text-base">
              <p>
                Insurance inspection reporting has a ratio problem: adjusters routinely spend more time writing up a claim than they spent inspecting it. Photos get organized by hand, findings get retyped into templates, and formatting eats the rest of the evening.
              </p>
              <p>
                FlacronAI, a product of Flacron Enterprises LLC, addresses that bottleneck directly. Upload your inspection photos and claim details, and the platform assembles an editable draft report with documented observations, photo references, and structured report sections.
              </p>
              <p>
                The FLACRON ENGINE does the assembling; you stay the professional. Every draft is meant to be reviewed, edited, and approved by a qualified adjuster before it goes anywhere. We build tooling that makes your judgment faster to document — not a replacement for it.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 px-4 bg-surface border-y border-gray-200">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-12" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Our Values</h2>
            <p className="text-gray-600">The principles that guide every product decision we make.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {VALUES.map((v, i) => {
              const Icon = v.icon;
              return (
                <motion.div key={v.title} className="card p-5"
                  initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}>
                  <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-brand-600" />
                  </div>
                  <h3 className="text-gray-900 font-semibold mb-2">{v.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{v.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-surface border-t border-gray-200">
        <motion.div className="text-center max-w-xl mx-auto"
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to Try FlacronAI?</h2>
          <p className="text-gray-600 mb-6">Start free — no credit card required. Create your first automated draft and review it before export.</p>
          <Link to="/signup" className="btn-primary inline-flex items-center gap-2">Get Started Free</Link>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
}
