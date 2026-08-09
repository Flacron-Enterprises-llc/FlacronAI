import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Seo from '../components/Seo.jsx';

const SUBPROCESSORS = [
  {
    name: 'Google Firebase',
    location: 'United States',
    service: 'Authentication, database (Firestore), and file storage',
    description: 'Firebase Authentication handles user sign-in and email verification. Firestore stores user profiles, reports, and claim data. Firebase Storage stores uploaded photographs and exported reports.',
    website: 'https://firebase.google.com/',
  },
  {
    name: 'Anthropic',
    location: 'United States',
    service: 'AI language model and image analysis',
    description: 'Anthropic Claude processes claim data and damage photographs to generate structured report text and identify visible damage patterns. Anthropic does not use submitted data for model training.',
    website: 'https://www.anthropic.com/',
  },
  {
    name: 'IBM Watson',
    location: 'United States',
    service: 'Fallback AI text generation',
    description: 'IBM WatsonX (Granite model) serves as a text-only fallback when the primary AI service is unavailable. Used only for report text generation, not image analysis.',
    website: 'https://www.ibm.com/watsonx',
  },
  {
    name: 'Stripe, Inc.',
    location: 'United States',
    service: 'Payment processing and subscription management',
    description: 'Stripe processes credit card payments, manages recurring subscriptions, and handles invoicing. FlacronAI does not store credit card numbers; Stripe processes and stores payment information directly.',
    website: 'https://stripe.com/',
  },
  {
    name: 'Amazon Web Services (AWS)',
    location: 'United States (us-east-1)',
    service: 'Email delivery (Amazon SES)',
    description: 'Amazon Simple Email Service sends transactional emails (account verification, password reset, payment notifications, team invitations). Email content is not used for any other purpose.',
    website: 'https://aws.amazon.com/ses/',
  },
  {
    name: 'Render',
    location: 'United States (Oregon)',
    service: 'Backend application hosting',
    description: 'Render hosts the FlacronAI backend API server. All data processed by the backend (user profiles, claim data, reports) resides in Firebase services, not on Render\'s disk.',
    website: 'https://render.com/',
  },
  {
    name: 'Vercel Inc.',
    location: 'United States',
    service: 'Frontend application hosting and CDN',
    description: 'Vercel hosts the FlacronAI web application frontend and serves static assets via a content delivery network. No personal data is stored on Vercel; all data lives in Firebase.',
    website: 'https://vercel.com/',
  },
];

const Subprocessors = () => {
  return (
    <div className="bg-bg min-h-screen">
      <Seo
        title="Subprocessors — FlacronAI"
        description="List of third-party subprocessors engaged by FlacronAI to process personal data, including their locations and services provided."
        path="/subprocessors"
      />
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Subprocessors</h1>
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-8 pb-8 border-b border-border">
            <span>Last updated: <strong className="text-gray-600">March 1, 2026</strong></span>
          </div>

          <div className="mb-8">
            <p className="text-gray-600 leading-relaxed mb-4">
              This page lists all third-party service providers ("Subprocessors") currently engaged by FlacronAI to process personal data on behalf of our customers. Each Subprocessor is bound by a written agreement requiring them to provide at least the same level of data protection as our{' '}
              <a href="/data-processing-agreement" className="text-brand-600 hover:underline font-medium">Data Processing Agreement</a>.
            </p>
            <p className="text-gray-600 leading-relaxed">
              We will notify you at least <strong>30 days in advance</strong> before adding or replacing a Subprocessor by updating this list and sending an email notification to your account email address. If you object to a new Subprocessor on legitimate Data Protection Law grounds, you may terminate the affected Service without penalty by providing written notice within that 30-day period.
            </p>
          </div>

          <div className="space-y-6">
            {SUBPROCESSORS.map((sub, index) => (
              <motion.div
                key={sub.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="card p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{sub.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      <span className="inline-flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {sub.location}
                      </span>
                    </p>
                  </div>
                  <a
                    href={sub.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-600 hover:text-brand-700 font-medium hover:underline shrink-0"
                  >
                    Visit website →
                  </a>
                </div>
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Service Provided</h3>
                  <p className="text-sm text-gray-600">{sub.service}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Details</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{sub.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-12 p-6 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Notice of Changes</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              We will update this page and send an email notification to your account email address at least 30 days before engaging a new Subprocessor or replacing an existing one.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              <strong>Right to object:</strong> If you have legitimate grounds to object to a new or replacement Subprocessor based on Data Protection Law requirements, notify us in writing within 30 days of receiving notice. If we cannot accommodate your objection, you may terminate the affected Service without penalty by providing written notice within that 30-day period.
            </p>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Questions about our Subprocessors or data processing practices?<br />
              Contact us at{' '}
              <a href="mailto:privacy@flacronenterprises.com" className="text-brand-600 hover:underline font-medium">
                privacy@flacronenterprises.com
              </a>
            </p>
          </div>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
};

export default Subprocessors;
