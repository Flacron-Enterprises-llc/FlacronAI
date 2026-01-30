import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import ContactSalesModal from '../components/common/ContactSalesModal';
import {
  ChevronDown,
  Search,
  HelpCircle,
  CreditCard,
  Shield,
  Zap,
  FileText,
  Code,
  Users,
  Building2,
  MessageSquare
} from 'lucide-react';
import '../styles/faqs.css';

function FAQs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [openItems, setOpenItems] = useState({});
  const [showContactModal, setShowContactModal] = useState(false);

  const categories = [
    { id: 'all', label: 'All Questions', icon: HelpCircle },
    { id: 'getting-started', label: 'Getting Started', icon: Zap },
    { id: 'pricing', label: 'Pricing & Billing', icon: CreditCard },
    { id: 'features', label: 'Features', icon: FileText },
    { id: 'api', label: 'API & Integration', icon: Code },
    { id: 'security', label: 'Security & Privacy', icon: Shield },
    { id: 'enterprise', label: 'Enterprise', icon: Building2 }
  ];

  const faqs = [
    // Getting Started
    {
      id: 1,
      category: 'getting-started',
      question: 'What is FlacronAI and how does it work?',
      answer: 'FlacronAI is an AI-powered platform that generates professional insurance inspection reports in seconds. Simply input your claim details, property information, and loss description, and our AI will create a comprehensive, professionally formatted report that meets industry standards. The platform uses advanced AI models including IBM WatsonX and OpenAI to analyze data and generate accurate, detailed reports.'
    },
    {
      id: 2,
      category: 'getting-started',
      question: 'How do I get started with FlacronAI?',
      answer: 'Getting started is easy! Simply create a free account, verify your email, and you\'re ready to generate your first report. The Starter plan gives you 1 free report per month. For more reports and advanced features, you can upgrade to Professional, Agency, or Enterprise plans at any time from your dashboard.'
    },
    {
      id: 3,
      category: 'getting-started',
      question: 'What types of insurance reports can FlacronAI generate?',
      answer: 'FlacronAI supports a wide range of insurance inspection report types including: Property Damage Reports, Water Damage Assessments, Fire & Smoke Damage Reports, Wind & Storm Damage Reports, Roof Inspection Reports, Vehicle Damage Reports, and comprehensive Loss Assessment Reports. Each report type is tailored to meet industry-specific requirements and formatting standards.'
    },
    {
      id: 4,
      category: 'getting-started',
      question: 'Can I upload photos for my reports?',
      answer: 'Yes! Professional, Agency, and Enterprise plans allow you to upload photos that will be analyzed and included in your reports. Our AI can analyze damage in photos and automatically incorporate relevant observations into your report. The number of photos allowed varies by plan: Professional (5 photos), Agency (10 photos), Enterprise (unlimited).'
    },

    // Pricing & Billing
    {
      id: 5,
      category: 'pricing',
      question: 'What plans are available and what do they cost?',
      answer: 'We offer four plans: Starter (Free - 1 report/month), Professional ($39.99/month - 20 reports), Agency ($99.99/month - 100 reports), and Enterprise ($499/month - unlimited). Each plan includes different features like PDF/DOCX export, photo analysis, API access, and priority support. View our pricing page for full details.'
    },
    {
      id: 6,
      category: 'pricing',
      question: 'Can I change or cancel my subscription anytime?',
      answer: 'Absolutely! You can upgrade, downgrade, or cancel your subscription at any time from your Settings > Billing page. If you cancel, you\'ll retain access to your current plan features until the end of your billing cycle. There are no long-term contracts or cancellation fees.'
    },
    {
      id: 7,
      category: 'pricing',
      question: 'Do you offer refunds?',
      answer: 'We offer a 14-day money-back guarantee for new subscriptions. If you\'re not satisfied with FlacronAI within the first 14 days, contact our support team for a full refund. After 14 days, refunds are evaluated on a case-by-case basis.'
    },
    {
      id: 8,
      category: 'pricing',
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards (Visa, Mastercard, American Express, Discover), debit cards, and PayPal. Enterprise customers can also pay via invoice or wire transfer with NET-30 terms. All payments are processed securely through Stripe.'
    },

    // Features
    {
      id: 9,
      category: 'features',
      question: 'What export formats are supported?',
      answer: 'FlacronAI supports multiple export formats: PDF (all plans), DOCX/Word (Professional+), and HTML. PDF exports are professionally formatted and ready for client delivery. DOCX exports allow you to make additional edits in Microsoft Word. All exports include your company branding on paid plans.'
    },
    {
      id: 10,
      category: 'features',
      question: 'Can I customize the report branding with my company logo?',
      answer: 'Yes! Professional and higher plans allow you to add your company logo and customize branding elements. Agency plans include additional custom branding options, and Enterprise plans offer full white-label capabilities where FlacronAI branding is completely removed.'
    },
    {
      id: 11,
      category: 'features',
      question: 'Are the generated reports editable?',
      answer: 'Yes, you can edit reports after generation. In the dashboard, click on any report to view and edit its content before exporting. You can also export as DOCX for editing in Microsoft Word (Professional+ plans).'
    },
    {
      id: 12,
      category: 'features',
      question: 'How accurate are the AI-generated reports?',
      answer: 'FlacronAI uses state-of-the-art AI models trained specifically for insurance documentation. Reports are highly accurate and follow CRU (Coverage, Recommendations, Understanding) formatting standards. However, we always recommend reviewing and verifying the content before final submission as AI may occasionally need minor corrections.'
    },

    // API & Integration
    {
      id: 13,
      category: 'api',
      question: 'Do you offer an API for integration?',
      answer: 'Yes! API access is available on Professional ($39.99/mo), Agency ($99.99/mo), and Enterprise plans. The API allows you to generate reports programmatically, integrate with your existing systems, and automate your workflow. Rate limits vary by plan: Professional (100 calls/hour), Agency (500 calls/hour), Enterprise (10,000 calls/hour).'
    },
    {
      id: 14,
      category: 'api',
      question: 'How do I get an API key?',
      answer: 'If you\'re on a Professional, Agency, or Enterprise plan, you can generate API keys from Settings > API Keys in your dashboard. You can create multiple keys with descriptive names (e.g., "Production", "Development") and revoke them at any time. API keys start with "flac_live_" and should be kept secure.'
    },
    {
      id: 15,
      category: 'api',
      question: 'What authentication methods does the API support?',
      answer: 'The API supports two authentication methods: API Key authentication (X-API-Key header) for programmatic access, and Bearer Token authentication (Authorization header) for web applications. API Key authentication is recommended for server-to-server integrations.'
    },
    {
      id: 16,
      category: 'api',
      question: 'Is there API documentation available?',
      answer: 'Yes! Comprehensive API documentation is available at /developers or in our Developer Portal. The documentation includes endpoint references, code examples in multiple languages (JavaScript, Python, cURL), authentication guides, and webhook integration details.'
    },

    // Security & Privacy
    {
      id: 17,
      category: 'security',
      question: 'How is my data protected?',
      answer: 'Security is our top priority. All data is encrypted in transit (TLS 1.3) and at rest (AES-256). We use Firebase/Google Cloud infrastructure which is SOC 2 Type II certified. We never sell your data, and you can delete your data at any time. See our Privacy Policy for full details.'
    },
    {
      id: 18,
      category: 'security',
      question: 'Is FlacronAI HIPAA compliant?',
      answer: 'While insurance inspection reports typically don\'t contain protected health information (PHI), Enterprise customers requiring HIPAA compliance can contact us for a Business Associate Agreement (BAA) and additional security configurations.'
    },
    {
      id: 19,
      category: 'security',
      question: 'Who has access to my reports and data?',
      answer: 'Only you and authorized users you invite have access to your reports. Our support team may access data only when explicitly requested for troubleshooting. We do not use your specific report data to train AI models - your data remains private.'
    },
    {
      id: 20,
      category: 'security',
      question: 'Can I delete my account and data?',
      answer: 'Yes, you can delete your account and all associated data at any time from Settings > Account. This will permanently remove all your reports, API keys, and personal information. This action is irreversible, so please export any reports you want to keep before deletion.'
    },

    // Enterprise
    {
      id: 21,
      category: 'enterprise',
      question: 'What is included in the Enterprise plan?',
      answer: 'Enterprise includes: Unlimited reports, unlimited users, unlimited API calls (10,000/hour), white-label portal with your branding, custom integrations, dedicated account manager, priority support with 4-hour SLA, SSO/SAML support, custom contracts, and advanced analytics. Contact sales for a custom quote.'
    },
    {
      id: 22,
      category: 'enterprise',
      question: 'Can FlacronAI integrate with our existing systems?',
      answer: 'Yes! Enterprise customers get access to custom integration support. We can integrate with your CRM, claims management system, document management system, and other tools. We also support webhooks for real-time event notifications and can build custom API endpoints for your specific needs.'
    },
    {
      id: 23,
      category: 'enterprise',
      question: 'Do you offer white-label solutions?',
      answer: 'Yes, Enterprise plans include full white-label capabilities. This includes: custom domain (reports.yourcompany.com), your branding throughout the platform, removal of FlacronAI branding from all reports and exports, and customizable email notifications with your branding.'
    },
    {
      id: 24,
      category: 'enterprise',
      question: 'How can I get a demo of Enterprise features?',
      answer: 'Contact our sales team through the Contact page or email enterprise@flacronai.com to schedule a personalized demo. We\'ll show you all Enterprise features, discuss your specific requirements, and provide a custom quote based on your needs.'
    }
  ];

  const toggleItem = (id) => {
    setOpenItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const filteredFaqs = faqs.filter(faq => {
    const matchesCategory = activeCategory === 'all' || faq.category === activeCategory;
    const matchesSearch = searchQuery === '' ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="faqs-page">
      <Navbar />

      {/* Hero Section */}
      <section className="faqs-hero">
        <div className="faqs-hero-content">
          <span className="hero-badge">Help Center</span>
          <h1>Frequently Asked Questions</h1>
          <p>
            Find answers to common questions about FlacronAI. Can't find what you're looking for? Contact our support team.
          </p>

          {/* Search Bar */}
          <div className="search-wrapper">
            <Search size={20} />
            <input
              type="text"
              placeholder="Search for answers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="hero-gradient-orb"></div>
      </section>

      {/* Main Content */}
      <section className="faqs-main">
        <div className="container">
          <div className="faqs-layout">
            {/* Category Sidebar */}
            <aside className="faqs-sidebar">
              <h3>Categories</h3>
              <nav className="category-nav">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`category-btn ${activeCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    <cat.icon size={18} />
                    <span>{cat.label}</span>
                    <span className="count">
                      {cat.id === 'all'
                        ? faqs.length
                        : faqs.filter(f => f.category === cat.id).length}
                    </span>
                  </button>
                ))}
              </nav>

              <div className="sidebar-cta">
                <MessageSquare size={24} />
                <h4>Still have questions?</h4>
                <p>Can't find the answer you're looking for? Our team is here to help.</p>
                <Link to="/contact" className="btn-contact">
                  Contact Support
                </Link>
              </div>
            </aside>

            {/* FAQ List */}
            <div className="faqs-content">
              {filteredFaqs.length === 0 ? (
                <div className="no-results">
                  <HelpCircle size={48} />
                  <h3>No results found</h3>
                  <p>Try adjusting your search or browse different categories.</p>
                  <button
                    className="btn-reset"
                    onClick={() => {
                      setSearchQuery('');
                      setActiveCategory('all');
                    }}
                  >
                    Clear Filters
                  </button>
                </div>
              ) : (
                <div className="accordion">
                  {filteredFaqs.map((faq) => (
                    <div
                      key={faq.id}
                      className={`accordion-item ${openItems[faq.id] ? 'open' : ''}`}
                    >
                      <button
                        className="accordion-header"
                        onClick={() => toggleItem(faq.id)}
                        aria-expanded={openItems[faq.id]}
                      >
                        <span className="question">{faq.question}</span>
                        <ChevronDown className="chevron" size={20} />
                      </button>
                      <div className="accordion-content">
                        <p>{faq.answer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Results Count */}
              {filteredFaqs.length > 0 && (
                <div className="results-count">
                  Showing {filteredFaqs.length} of {faqs.length} questions
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="faqs-cta">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Transform Your Workflow?</h2>
            <p>Join thousands of insurance professionals using FlacronAI to create reports faster.</p>
            <div className="cta-buttons">
              <Link to="/auth" className="btn-primary">
                Get Started Free
              </Link>
              <button onClick={() => setShowContactModal(true)} className="btn-secondary">
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      <ContactSalesModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
      />
    </div>
  );
}

export default FAQs;
