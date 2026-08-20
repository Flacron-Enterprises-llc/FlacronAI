import { motion } from 'framer-motion';
import { Shield, Lock, Key, Database, FileCheck, AlertTriangle, Mail } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Seo from '../components/Seo.jsx';

const INLINE_TOKEN =
  /(\*\*\[[^\]]+\]\([^)]+\)\*\*|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

const renderInlineMarkdown = (text) =>
  text
    .split(INLINE_TOKEN)
    .filter((part) => part)
    .map((part, i) => {
      const boldLinkMatch = part.match(/^\*\*\[([^\]]+)\]\(([^)]+)\)\*\*$/);
      if (boldLinkMatch) {
        return (
          <a
            key={i}
            href={boldLinkMatch[2]}
            className="font-semibold text-brand-600 hover:underline"
          >
            {boldLinkMatch[1]}
          </a>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-gray-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-800 break-words"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a key={i} href={linkMatch[2]} className="text-brand-600 hover:underline font-medium">
            {linkMatch[1]}
          </a>
        );
      }
      return part;
    });

const SECTIONS = [
  {
    id: 'overview',
    title: 'Security Overview',
    icon: Shield,
    content: `FlacronAI is built with security as a foundational requirement. Insurance claim data is sensitive, and we treat every uploaded photograph, claim detail, and generated report as confidential information requiring protection at rest, in transit, and during processing.

This page describes the technical security controls currently implemented in the FlacronAI platform. We do not hold third-party security certifications at this time.`,
  },
  {
    id: 'encryption',
    title: 'Encryption',
    icon: Lock,
    content: `Data in transit:
All communication between your browser and our servers uses TLS 1.2 or higher (HTTPS). API requests, file uploads, and authentication tokens are encrypted during transmission.

Data at rest:
User data, claim photographs, and generated reports are stored in Google Firebase Firestore and Firebase Storage. Google encrypts all data at rest by default using AES-256 encryption. Encryption keys are managed by Google Cloud Platform. We do not use additional customer-managed encryption (CMEK) or application-layer encryption at this time.

We do not store payment card details. Credit card information is processed and stored directly by Stripe, our payment processor, and never touches our servers.`,
  },
  {
    id: 'access-control',
    title: 'Access Control & Authentication',
    icon: Key,
    content: `User authentication:
FlacronAI uses Firebase Authentication for user identity. Supported methods:
- Email and password (with email verification required before account use)
- Google single sign-on

Multi-factor authentication (MFA):
Time-based one-time password (TOTP) authentication is available as an opt-in feature in account settings. When enabled, MFA is required at every login.

Session management:
- Login sessions use Firebase ID tokens with a configurable expiration.
- Custom JWT tokens issued during registration include a \`tokenVersion\` claim. When a user changes their password or explicitly logs out, the token version is incremented server-side, immediately invalidating all outstanding tokens.
- New-device login alerts are sent by email when an account is accessed from an unrecognized browser or IP address.

Role-based access control (RBAC):
Access to features is controlled by subscription tier (Starter, Professional, Agency, Enterprise) and team roles (for Enterprise accounts). Tier checks are enforced server-side on every API request — the client cannot bypass plan restrictions.

Admin access:
Platform administration is restricted to a single email address configured via environment variable. Admin actions (tier updates, user deletion, audit log access) require authenticated admin privileges and are logged to the \`auditLogs\` collection.`,
  },
  {
    id: 'data-storage',
    title: 'Data Storage & Isolation',
    icon: Database,
    content: `**Infrastructure:**
- Database: Google Cloud Firestore (NoSQL document database)
- File storage: Google Firebase Storage
- Backend API: Render (Oregon, United States)
- Frontend application: Vercel (United States)

Data isolation:
- Each user's reports, photographs, and profile data are isolated by user ID (\`userId\` field).
- Firestore security rules enforce that users can only read and write their own data.
- File storage paths are scoped to the user: \`users/{userId}/reports/...\`, \`users/{userId}/exports/...\`
- Claim photographs and exported reports require authentication to download. Public access is not permitted.

Geographic location:
User data is stored in Google Cloud's \`us-central\` region (United States). Data residency outside the US is not currently offered.

Backup and recovery:
Google Cloud Firestore provides automatic replication and point-in-time recovery (PITR). Recovery point objective (RPO) and recovery time objective (RTO) depend on Google Cloud's service-level agreements for Firestore. We do not maintain separate backup infrastructure beyond Google Cloud's built-in durability guarantees.`,
  },
  {
    id: 'ai-processing',
    title: 'AI Data Handling',
    icon: FileCheck,
    content: `AI providers:
FlacronAI uses third-party AI services to analyze claim photographs and generate report text:
- Primary: Anthropic Claude (language model and image analysis)
- Fallback: IBM WatsonX Granite (text-only, used when Claude is unavailable)

Data sent to AI providers:
When you generate a report, the following data is sent to the AI provider:
- Claim details you entered (policyholder name, property address, date of loss, loss description, etc.)
- Uploaded photographs (JPEG/PNG/GIF/WebP formats only; up to 100 photos per report, sent to the vision model in batches of up to 10 images per request)
- Instructions to generate structured report text

Data retention by AI providers:
- Anthropic: According to Anthropic's data usage policy, data submitted via API is not used to train models. Anthropic retains API data for up to 30 days for trust and safety purposes, then deletes it.
- IBM WatsonX: Text-only fallback. IBM Watson processes API requests and does not use submitted data for model training outside of the customer's own account.

What AI does NOT see:
- Payment information (handled entirely by Stripe)
- Your account password (hashed with bcrypt; never transmitted to AI services)
- Reports you have not yet generated (AI only processes data you explicitly submit via "Generate Report")

Limitations:
AI-generated content is a draft for professional review. FlacronAI does not use AI to make final determinations about coverage, liability, fraud, or claim approval. A licensed insurance professional must review, edit, and approve every report before it is used.`,
  },
  {
    id: 'data-retention',
    title: 'Data Retention & Deletion',
    icon: Database,
    content: `Active accounts:
Your account data, reports, and uploaded files remain accessible as long as your account is active. There is no automatic expiry.

Canceled subscriptions:
When you cancel a paid subscription, your account reverts to the free Starter plan. Your data remains accessible — cancellation does not delete your account or reports.

Account deletion:
You may delete your account at any time from Settings → Security → Delete Account. Deletion is immediate and irreversible. When you delete your account:
- Your user profile, reports, uploaded photos, and exported files are permanently removed from Firestore and Firebase Storage.
- Your Firebase Authentication account is deleted.
- Your Stripe customer record (if any) is retained for billing and tax compliance but is disassociated from your user ID.

Logs and audit trails:
Audit logs (login events, security actions, admin actions) are retained for 90 days after the event. Logs are stored in Firestore and are accessible only to platform administrators.

Legal holds:
If your data is subject to a legal hold, preservation order, or active investigation, we may retain data beyond the periods described here as required by law.`,
  },
  {
    id: 'incident-response',
    title: 'Security Incident Reporting',
    icon: AlertTriangle,
    content: `If you discover a security vulnerability:
Please report it responsibly by emailing (security@flacronenterprises.com) with:
- A description of the vulnerability
- Steps to reproduce the issue
- The potential impact
- Your contact information

We will acknowledge your report within **72 hours** and provide an estimated timeline for resolution.

Do not:
- Publicly disclose the vulnerability before we have had a reasonable opportunity to address it.
- Access, modify, or delete data that does not belong to you.
- Perform attacks that degrade service availability (denial-of-service, load testing without permission).

If you experience a security concern with your account:
- Unauthorized access: Immediately change your password and enable multi-factor authentication from Settings → Security.
- Suspicious activity: Review your audit log (Settings → Security → Login History) and revoke access if needed.
- Contact us: Email support@flacronenterprises.com if you believe your account has been compromised.

Our commitment:
- We will investigate all credible security reports.
- We will not pursue legal action against researchers who follow responsible disclosure.
- We may publicly acknowledge researchers who report valid vulnerabilities (with your permission).`,
  },
  {
    id: 'subprocessors',
    title: 'Third-Party Subprocessors',
    icon: FileCheck,
    content: `FlacronAI relies on third-party service providers ("subprocessors") to deliver the platform. Each subprocessor processes user data under a written agreement requiring them to maintain appropriate security controls.

A complete, up-to-date list of subprocessors is available on our **[Subprocessors page](/subprocessors)**, including:
- Google Firebase (authentication, database, file storage)
- Anthropic (AI language model and image analysis)
- IBM Watson (fallback AI text generation)
- Stripe (payment processing)
- Amazon Web Services (transactional email via SES)
- Render (backend API hosting)
- Vercel (frontend application hosting and CDN)

We will notify you at least 30 days before adding or replacing a subprocessor. If you object on legitimate data protection grounds, you may terminate the affected service without penalty during that 30-day period.`,
  },
  {
    id: 'compliance',
    title: 'Compliance & Certifications',
    icon: Shield,
    content: `Current status:
FlacronAI does not currently hold SOC 2, ISO 27001, HIPAA, or other third-party security certifications.

GDPR (General Data Protection Regulation):
If you are located in the European Economic Area (EEA), you have rights under GDPR, including:
- Right to access your personal data
- Right to correct inaccurate data
- Right to delete your data ("right to be forgotten")
- Right to data portability
- Right to object to processing

To exercise these rights, contact privacy@flacronenterprises.com. See our [Data Processing Agreement](/data-processing-agreement) for details on how we process personal data.

CCPA (California Consumer Privacy Act):
If you are a California resident, you have rights under CCPA. See our [Privacy Policy](/privacy-policy) for details.

Data breach notification:
In the event of a data breach that affects your personal information, we will notify you and any applicable regulatory authorities in accordance with applicable law. Under GDPR, we will notify affected individuals and authorities within 72 hours of becoming aware of the breach, as described in our [Data Processing Agreement](/data-processing-agreement).`,
  },
  {
    id: 'contact',
    title: 'Security Contact',
    icon: Mail,
    content: `For security vulnerabilities and incident reports:
Email: security@flacronenterprises.com

For privacy and data protection inquiries:
Email: privacy@flacronenterprises.com

For general support:
Email: support@flacronenterprises.com

Mailing address:
Flacron Enterprises LLC
Tampa, Florida, United States

We respond to security reports within 72 hours and privacy inquiries within 5 business days.`,
  },
];

const Security = () => {
  return (
    <div className="bg-bg min-h-screen">
      <Seo
        title="Security — FlacronAI"
        description="FlacronAI's security practices covering encryption, access control, data retention, AI data handling, and incident response."
        path="/security"
      />
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-12">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 border border-brand-100 mb-6">
              <Shield className="w-7 h-7 text-brand-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Security</h1>
            <p className="text-lg text-gray-600 leading-relaxed max-w-3xl">
              How FlacronAI protects your data, controls access, and responds to security incidents.
            </p>
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-6 pt-6 border-t border-border">
              <span>Last updated: <strong className="text-gray-600">August 6, 2026</strong></span>
            </div>
          </div>

          <div className="space-y-6">
            {SECTIONS.map((section, index) => {
              const IconComponent = section.icon;
              return (
                <motion.section
                  key={section.id}
                  id={section.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="card p-6 scroll-mt-20"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
                      <IconComponent className="w-5 h-5 text-brand-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-bold text-gray-900 mb-3">{section.title}</h2>
                      <div className="prose prose-gray prose-sm max-w-none">
                        <p className="text-gray-600 leading-relaxed whitespace-pre-line break-words">
                          {renderInlineMarkdown(section.content)}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.section>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-12 p-6 bg-blue-50 border border-blue-200 rounded-xl"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Commitment to Security
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Security is an ongoing process, not a one-time achievement. We continuously monitor our systems, apply security updates, and review our practices to protect your data.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              If you have questions about our security practices or would like to report a concern, please contact{' '}
              <a href="mailto:security@flacronenterprises.com" className="text-brand-600 hover:underline font-medium">
                security@flacronenterprises.com
              </a>.
            </p>
          </motion.div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              For details on how your data is processed and your privacy rights, see our{' '}
              <a href="/privacy-policy" className="text-brand-600 hover:underline font-medium">Privacy Policy</a>
              {' '}and{' '}
              <a href="/data-processing-agreement" className="text-brand-600 hover:underline font-medium">Data Processing Agreement</a>.
            </p>
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
};

export default Security;
