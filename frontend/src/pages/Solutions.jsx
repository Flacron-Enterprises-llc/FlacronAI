import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Briefcase, Building2, Landmark, Network, ClipboardList, Droplets, HardHat } from 'lucide-react';
import Navbar from '../components/Navbar.jsx';
import Footer from '../components/Footer.jsx';
import Seo from '../components/Seo.jsx';
import SOLUTIONS from '../data/solutions.js';

const ICONS = {
  'independent-adjusters': Briefcase,
  'adjusting-firms': Building2,
  'insurance-carriers': Landmark,
  tpas: Network,
  'inspection-companies': ClipboardList,
  'restoration-companies': Droplets,
  contractors: HardHat,
};

export default function Solutions() {
  return (
    <div className="min-h-screen bg-bg">
      <Seo
        title="Solutions by Role — FlacronAI"
        description="See how FlacronAI's automated report drafting fits independent adjusters, adjusting firms, insurance carriers, TPAs, inspection companies, restoration companies, and contractors."
        path="/solutions"
      />
      <Navbar />

      <div className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-4">
            Built for Every Role in the Claim
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            The same drafting engine, review workflow, and export options — organized around how your
            team actually works.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SOLUTIONS.map((solution, i) => {
            const Icon = ICONS[solution.slug] || Briefcase;
            return (
              <motion.div
                key={solution.slug}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
              >
                <Link
                  to={`/solutions/${solution.slug}`}
                  className="card p-6 h-full flex flex-col hover:border-brand-500/30 transition-all duration-300 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5 text-brand-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">{solution.name}</h2>
                  <p className="text-brand-700 text-sm font-medium mb-3">{solution.tagline}</p>
                  <p className="text-gray-600 text-sm leading-relaxed mb-4 flex-1">{solution.summary}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 group-hover:text-brand-800">
                    See how it fits
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="text-center mt-16">
          <Link to="/signup" className="btn-primary inline-flex items-center gap-2">
            Try It Free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
