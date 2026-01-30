import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Navbar, Footer } from '../components/layout';
import ContactSalesModal from '../components/common/ContactSalesModal';
import '../styles/elite-landing.css';

const Pricing = () => {
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [showContactModal, setShowContactModal] = useState(false);

  useEffect(() => {
    document.title = 'Pricing - FlacronAI';
    window.scrollTo(0, 0);
  }, []);

  const plans = [
    {
      name: 'Professional',
      description: 'Perfect for individual insurance agents and adjusters',
      monthlyPrice: 39.99,
      yearlyPrice: 383.90,
      features: [
        '20 reports per month',
        'AI-powered generation',
        'PDF & DOCX export',
        'No watermark',
        'Custom logo',
        'Email support'
      ],
      recommended: false
    },
    {
      name: 'Agency',
      description: 'Ideal for growing insurance agencies and teams',
      monthlyPrice: 99.99,
      yearlyPrice: 959.90,
      features: [
        '100 reports per month',
        '5 user accounts',
        'All export formats',
        'Agency dashboard',
        'Custom branding',
        'Priority support'
      ],
      recommended: true
    },
    {
      name: 'Enterprise',
      description: 'For large organizations with custom needs',
      monthlyPrice: 499,
      yearlyPrice: 4790.40,
      features: [
        'Unlimited reports',
        'Unlimited users',
        'API access',
        'White-label portal',
        'Custom integration',
        'Dedicated support'
      ],
      recommended: false
    }
  ];

  return (
    <>
      <Navbar />

      <div className="pricing-page" style={{ paddingTop: '100px', paddingBottom: '80px', background: '#FFFFFF' }}>
        {/* Hero Section */}
        <section style={{ padding: '60px 0', background: 'linear-gradient(to bottom, rgba(255, 124, 8, 0.15) 0%, rgba(255, 124, 8, 0.05) 50%, transparent 100%)' }}>
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}
            >
              <h1 style={{ fontSize: '3rem', fontWeight: '700', color: '#000000', marginBottom: '1rem' }}>
                Simple, Transparent Pricing
              </h1>
              <p style={{ fontSize: '1.25rem', color: 'rgba(0, 0, 0, 0.7)', lineHeight: '1.6', marginBottom: '2rem' }}>
                Choose the plan that fits your needs. All plans include our core AI-powered report generation.
              </p>

              {/* Billing Toggle */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '1rem', background: '#FFFFFF', border: '1px solid rgba(255, 124, 8, 0.3)', borderRadius: '8px', padding: '0.5rem' }}>
                <button
                  onClick={() => setBillingPeriod('monthly')}
                  style={{
                    padding: '0.5rem 1.5rem',
                    background: billingPeriod === 'monthly' ? '#FF7C08' : 'transparent',
                    color: billingPeriod === 'monthly' ? '#FFFFFF' : '#000000',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod('yearly')}
                  style={{
                    padding: '0.5rem 1.5rem',
                    background: billingPeriod === 'yearly' ? '#FF7C08' : 'transparent',
                    color: billingPeriod === 'yearly' ? '#FFFFFF' : '#000000',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Yearly
                  <span style={{ marginLeft: '0.5rem', color: billingPeriod === 'yearly' ? '#FFFFFF' : '#FF7C08', fontSize: '0.75rem' }}>
                    (Save 20%)
                  </span>
                </button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section style={{ padding: '60px 0' }}>
          <div className="container">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
              {plans.map((plan, index) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  style={{
                    background: '#FFFFFF',
                    border: plan.recommended ? '2px solid #FF7C08' : '1px solid rgba(255, 124, 8, 0.2)',
                    borderRadius: '8px',
                    padding: '2.5rem 2rem',
                    position: 'relative',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {plan.recommended && (
                    <div style={{
                      position: 'absolute',
                      top: '-12px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#FF7C08',
                      color: '#FFFFFF',
                      padding: '0.35rem 1rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Recommended
                    </div>
                  )}

                  <h3 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#000000', marginBottom: '0.5rem' }}>
                    {plan.name}
                  </h3>
                  <p style={{ fontSize: '0.95rem', color: 'rgba(0, 0, 0, 0.7)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                    {plan.description}
                  </p>

                  <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span style={{ fontSize: '3rem', fontWeight: '700', color: '#000000' }}>
                        ${billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice.toFixed(2)}
                      </span>
                      <span style={{ fontSize: '1rem', color: 'rgba(0, 0, 0, 0.6)' }}>
                        /{billingPeriod === 'monthly' ? 'month' : 'year'}
                      </span>
                    </div>
                    {billingPeriod === 'yearly' && (
                      <p style={{ fontSize: '0.875rem', color: 'rgba(0, 0, 0, 0.6)', marginTop: '0.5rem' }}>
                        ${(plan.yearlyPrice / 12).toFixed(2)}/month billed annually
                      </p>
                    )}
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, marginBottom: '2rem' }}>
                    {plan.features.map((feature, idx) => (
                      <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: '2px' }}>
                          <circle cx="10" cy="10" r="10" fill="#FF7C08"/>
                          <path d="M6 10L9 13L14 7" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span style={{ fontSize: '0.95rem', color: 'rgba(0, 0, 0, 0.8)', lineHeight: '1.5' }}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {plan.name === 'Enterprise' ? (
                    <button
                      onClick={() => setShowContactModal(true)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.875rem 0',
                        background: '#FF7C08',
                        color: '#FFFFFF',
                        border: `2px solid #FF7C08`,
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        textAlign: 'center',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Contact Sales
                    </button>
                  ) : (
                    <Link
                      to="/auth"
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.875rem 0',
                        background: plan.recommended ? '#FF7C08' : '#FFFFFF',
                        color: plan.recommended ? '#FFFFFF' : '#FF7C08',
                        border: `2px solid #FF7C08`,
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        textAlign: 'center',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {plan.name === 'Professional' ? 'Select Professional' : 'Select Agency'}
                    </Link>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Comparison */}
        <section style={{ padding: '80px 0', background: 'linear-gradient(to bottom, transparent 0%, rgba(255, 124, 8, 0.05) 50%, transparent 100%)' }}>
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              style={{ textAlign: 'center', marginBottom: '3rem' }}
            >
              <h2 style={{ fontSize: '2.5rem', fontWeight: '700', color: '#000000', marginBottom: '1rem' }}>
                All Plans Include
              </h2>
              <p style={{ fontSize: '1.125rem', color: 'rgba(0, 0, 0, 0.7)', maxWidth: '700px', margin: '0 auto' }}>
                Every FlacronAI plan comes with these powerful features
              </p>
            </motion.div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
              {[
                { title: 'AI-Powered Analysis', desc: 'Advanced artificial intelligence for accurate report generation' },
                { title: 'Secure Cloud Storage', desc: 'Bank-level encryption for all your sensitive data' },
                { title: 'Mobile Access', desc: 'Work from anywhere with our mobile-friendly platform' },
                { title: 'Real-time Updates', desc: 'Get instant updates on report generation status' },
                { title: 'Data Privacy', desc: 'Full compliance with GDPR and industry standards' },
                { title: 'Regular Updates', desc: 'Continuous improvements and new features' }
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid rgba(255, 124, 8, 0.2)',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    textAlign: 'center'
                  }}
                >
                  <div style={{
                    width: '60px',
                    height: '60px',
                    background: 'rgba(255, 124, 8, 0.1)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem'
                  }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13l4 4L19 7" stroke="#FF7C08" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#000000', marginBottom: '0.5rem' }}>
                    {feature.title}
                  </h3>
                  <p style={{ fontSize: '0.95rem', color: 'rgba(0, 0, 0, 0.7)', lineHeight: '1.5' }}>
                    {feature.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section style={{ padding: '80px 0' }}>
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              style={{ textAlign: 'center', marginBottom: '3rem' }}
            >
              <h2 style={{ fontSize: '2.5rem', fontWeight: '700', color: '#000000', marginBottom: '1rem' }}>
                Frequently Asked Questions
              </h2>
            </motion.div>

            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              {[
                { q: 'Can I change plans later?', a: 'Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.' },
                { q: 'What happens if I exceed my report limit?', a: 'You can purchase additional reports or upgrade to a higher tier plan to continue generating reports.' },
                { q: 'Is there a free trial?', a: 'Yes! Starter plans include a 7-day free trial, and Professional plans include a 14-day free trial. No credit card required.' },
                { q: 'Do you offer refunds?', a: 'We offer a 30-day money-back guarantee for all annual plans. Contact support for more details.' }
              ].map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid rgba(255, 124, 8, 0.2)',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    marginBottom: '1rem'
                  }}
                >
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#000000', marginBottom: '0.75rem' }}>
                    {faq.q}
                  </h3>
                  <p style={{ fontSize: '1rem', color: 'rgba(0, 0, 0, 0.7)', lineHeight: '1.6' }}>
                    {faq.a}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section style={{ padding: '80px 0', background: 'linear-gradient(to bottom, rgba(255, 124, 8, 0.15) 0%, rgba(255, 124, 8, 0.05) 50%, transparent 100%)' }}>
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}
            >
              <h2 style={{ fontSize: '2.5rem', fontWeight: '700', color: '#000000', marginBottom: '1rem' }}>
                Ready to Get Started?
              </h2>
              <p style={{ fontSize: '1.125rem', color: 'rgba(0, 0, 0, 0.7)', marginBottom: '2rem', lineHeight: '1.6' }}>
                Join thousands of insurance professionals who trust FlacronAI for their report generation needs.
              </p>
              <Link
                to="/auth"
                style={{
                  display: 'inline-block',
                  padding: '1rem 3rem',
                  background: '#FF7C08',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontSize: '1rem',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderRadius: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                Start Free Trial
              </Link>
            </motion.div>
          </div>
        </section>
      </div>

      <Footer />

      <ContactSalesModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
      />
    </>
  );
};

export default Pricing;
