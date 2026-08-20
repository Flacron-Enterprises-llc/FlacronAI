import { useParams, Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, AlertCircle } from 'lucide-react';
import Navbar from '../components/Navbar.jsx';
import Footer from '../components/Footer.jsx';
import Seo from '../components/Seo.jsx';
import { getSolution } from '../data/solutions.js';

export default function SolutionDetail() {
  const { slug } = useParams();
  const solution = getSolution(slug);

  if (!solution) return <Navigate to="/solutions" replace />;

  return (
    <div className="min-h-screen bg-bg">
      <Seo
        title={`${solution.name} — FlacronAI Solutions`}
        description={solution.summary}
        path={`/solutions/${solution.slug}`}
      />
      <Navbar />

      <div className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-14">
          <Link to="/solutions" className="text-sm text-gray-500 hover:text-gray-700">
            ← All solutions
          </Link>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 mt-4 mb-4">{solution.name}</h1>
          <p className="text-xl text-brand-700 font-medium mb-4">{solution.tagline}</p>
          <p className="text-gray-600 text-lg leading-relaxed max-w-3xl">{solution.summary}</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-10 mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">What usually slows this down</h2>
            <ul className="space-y-3">
              {solution.painPoints.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-gray-600 text-sm leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">How FlacronAI helps</h2>
            <div className="space-y-4">
              {solution.features.map((feature) => (
                <div key={feature.title} className="card p-4">
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{feature.title}</p>
                      <p className="text-sm text-gray-600 mt-0.5">{feature.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="card p-10 text-center relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-amber-500/5" />
          <div className="relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              Recommended starting point: {solution.suggestedTier}
            </h2>
            <p className="text-gray-600 mb-6">
              Every tier includes automated drafting and human review — upgrade for higher report volume, CRM,
              API access, or white-label.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/signup" className="btn-primary inline-flex items-center gap-2">
                Try It Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/pricing" className="btn-secondary inline-flex items-center gap-2">
                Compare Plans
              </Link>
            </div>
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}
