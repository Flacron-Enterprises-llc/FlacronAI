import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Seo from '../components/Seo.jsx';

const renderInlineMarkdown = (text) =>
  text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      )
    );

const SECTIONS = [
  {
    id: 'purpose',
    title: '1. Purpose',
    content: `This Acceptable Use Policy ("AUP") governs your use of the FlacronAI platform ("Service"). By accessing or using the Service, you agree to comply with this AUP. Violations may result in immediate suspension or termination of your account without refund.

This AUP exists to protect all users, maintain platform integrity, comply with applicable law, and prevent abuse that harms FlacronAI, its users, or third parties.`,
  },
  {
    id: 'prohibited-activities',
    title: '2. Prohibited Activities',
    content: `You may not use the Service to:

Illegal activity:
- Engage in, promote, or facilitate illegal activity under applicable federal, state, or local law.
- Violate intellectual property rights, including uploading copyrighted images or claim data you do not have the right to use.
- Commit fraud, identity theft, or misrepresentation.

Abusive or harmful conduct:
- Harass, threaten, defame, or intimidate any person.
- Upload content that is obscene, sexually explicit (unrelated to legitimate claim documentation), or depicts violence for purposes unrelated to insurance documentation.
- Distribute malware, viruses, or harmful code.
- Attempt to gain unauthorized access to other users' accounts, our systems, or third-party systems.

Platform abuse:
- Reverse-engineer, decompile, or attempt to extract source code from the Service.
- Use automated means (bots, scrapers) to access the Service except through the documented API with a valid API key.
- Overload, disrupt, or impair the Service's infrastructure or interfere with other users' access.
- Create multiple accounts to evade limits, bans, or billing.
- Share API keys or account credentials with unauthorized third parties.

Misuse of AI-generated content:
- Submit AI-generated reports as final professional work without human review, verification, and sign-off by a licensed insurance adjuster.
- Use the Service to generate reports for claims in which you have no legitimate professional role or authorization.
- Alter AI-generated findings to misrepresent observed damage for fraudulent purposes.
- Remove or obscure disclosures that a report is AI-assisted.`,
  },
  {
    id: 'professional-use',
    title: '3. Professional Use Standards',
    content: `Licensing and authority:
You represent that you hold all required professional licenses to perform insurance claim inspections and issue reports in the jurisdictions where you operate. You are responsible for ensuring your use of the Service complies with all applicable professional standards and regulations.

Human review requirement:
AI-generated content is a draft. You must review, verify, and approve all findings before submitting a report to an insurance carrier, court, or client. The Service does not replace professional judgment.

Accuracy and honesty:
You must provide accurate claim information and upload genuine photographs. Fabricating damage, submitting staged photographs, or knowingly generating false reports violates this AUP and may constitute insurance fraud under applicable law.

Data integrity:
You are responsible for the accuracy and completeness of all claim data you submit. FlacronAI is not liable for errors in reports that result from inaccurate input data.`,
  },
  {
    id: 'content-standards',
    title: '4. Content You Submit',
    content: `**Ownership and rights:**
You retain ownership of all photographs, claim data, and report content you submit. By uploading content, you represent that you have the legal right to use it and that it does not violate the intellectual property, privacy, or other rights of any third party.

Prohibited content:
Do not upload content that is illegal, defamatory, obscene (unrelated to legitimate insurance documentation), infringes intellectual property, violates privacy rights, or contains malware.

Consent and authorization:
By submitting claim data and photographs, you represent that you have obtained all necessary consents and authorizations from the property owner, claimant, and any other relevant parties, and that your submission complies with applicable privacy and data protection laws.`,
  },
  {
    id: 'security',
    title: '5. Security Obligations',
    content: `**Account security:**
You are responsible for safeguarding your login credentials, API keys, and any other access tokens. Do not share credentials with unauthorized individuals or store them insecurely.

Vulnerability reporting:
If you discover a security vulnerability in the Service, report it immediately to security@flacronenterprises.com. Do not exploit the vulnerability or disclose it publicly before we have had reasonable time to address it.

Data protection:
Treat all claim data, reports, and client information as confidential. Implement appropriate technical and organizational measures to protect data you process through the Service.`,
  },
  {
    id: 'monitoring',
    title: '6. Monitoring and Enforcement',
    content: `FlacronAI reserves the right to:
- Monitor use of the Service to detect violations of this AUP and to maintain platform security and performance.
- Investigate suspected violations and request information from users.
- Remove content that violates this AUP.
- Suspend or terminate accounts that violate this AUP, with or without notice, and without refund.
- Report illegal activity to law enforcement authorities.
- Preserve and disclose account information and content when required by law or to protect our rights, property, or safety, or the rights, property, or safety of others.`,
  },
  {
    id: 'reporting',
    title: '7. Reporting Violations',
    content: `If you believe another user is violating this AUP, report it to abuse@flacronenterprises.com with:
- A description of the violation.
- Evidence (screenshots, URLs, report IDs, timestamps).
- Your contact information (if you wish to be contacted for follow-up).

We review all reports but cannot guarantee a response for every submission. We will not disclose the outcome of individual investigations.`,
  },
  {
    id: 'changes',
    title: '8. Changes to This Policy',
    content: `We may update this Acceptable Use Policy at any time. Material changes will be announced via email and posted on the platform at least 30 days before they take effect. Continued use of the Service after the effective date constitutes acceptance of the revised AUP.

If you do not agree to the revised policy, you must discontinue use of the Service.`,
  },
  {
    id: 'contact',
    title: '9. Contact',
    content: `For questions about this Acceptable Use Policy or to report a violation:

**Email:** abuse@flacronenterprises.com
**Address:** Flacron Enterprises LLC, Tampa, Florida, United States

For security vulnerabilities, use security@flacronenterprises.com.`,
  },
];

const AcceptableUsePolicy = () => {
  return (
    <div className="bg-bg min-h-screen">
      <Seo
        title="Acceptable Use Policy — FlacronAI"
        description="FlacronAI's Acceptable Use Policy governing prohibited activities, professional use standards, and security obligations."
        path="/acceptable-use-policy"
      />
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Acceptable Use Policy</h1>
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-8 pb-8 border-b border-border">
            <span>Last updated: <strong className="text-gray-600">March 1, 2026</strong></span>
            <span>•</span>
            <span>Effective: <strong className="text-gray-600">March 1, 2026</strong></span>
          </div>

          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <motion.section
                key={section.id}
                id={section.id}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.4 }}
                className="scroll-mt-20"
              >
                <h2 className="text-2xl font-bold text-gray-900 mb-4">{section.title}</h2>
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-600 leading-relaxed whitespace-pre-line break-words">
                    {renderInlineMarkdown(section.content)}
                  </p>
                </div>
              </motion.section>
            ))}
          </div>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
};

export default AcceptableUsePolicy;