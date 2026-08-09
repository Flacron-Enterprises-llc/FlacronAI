import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Seo from '../components/Seo.jsx';

const SECTIONS = [
  {
    id: 'definitions',
    title: '1. Definitions',
    content: `For the purposes of this Data Processing Agreement ("DPA"):

"Controller" means the Customer (you), who determines the purposes and means of processing Personal Data.

"Processor" means FlacronAI, Inc. ("FlacronAI," "we," or "us"), who processes Personal Data on behalf of the Controller.

"Personal Data" means any information relating to an identified or identifiable natural person submitted to the Service, including but not limited to claimant names, property addresses, contact information, and any other data defined as personal data, personal information, or personally identifiable information under applicable Data Protection Laws.

"Processing" means any operation performed on Personal Data, including collection, storage, analysis, transmission, and deletion.

"Data Protection Laws" means all applicable laws and regulations relating to privacy and data protection, including but not limited to the General Data Protection Regulation (GDPR) (EU) 2016/679, the California Consumer Privacy Act (CCPA), and other applicable U.S. state privacy laws.

"Data Subject" means the individual to whom Personal Data relates.

"Sub-processor" means any third-party service provider engaged by FlacronAI to process Personal Data on behalf of the Controller.

"Service" means the FlacronAI platform as described in the Terms of Service.`,
  },
  {
    id: 'scope-roles',
    title: '2. Scope and Roles',
    content: `Controller responsibilities:
You act as the Controller of Personal Data you submit to the Service. You are responsible for:
- Determining what Personal Data is submitted and for what purposes.
- Ensuring you have a lawful basis to collect and process the Personal Data under applicable Data Protection Laws.
- Obtaining all necessary consents, authorizations, and notices from Data Subjects before submitting their Personal Data to the Service.
- Complying with Data Subject rights requests (access, rectification, deletion, etc.).

Processor responsibilities:
FlacronAI acts as a Processor. We process Personal Data only:
- On your documented instructions (via your use of the Service).
- In accordance with this DPA, the Terms of Service, and applicable Data Protection Laws.
- For the purpose of providing the Service as described in the Terms of Service.

We will not process Personal Data for any other purpose, sell it, or use it to build profiles or for marketing unrelated to the Service.`,
  },
  {
    id: 'processing-instructions',
    title: '3. Processing Instructions',
    content: `Your instructions:
By using the Service, you instruct FlacronAI to process Personal Data to:
- Generate AI-assisted insurance claim reports based on the data and photographs you submit.
- Store reports, claim data, and photographs for the duration necessary to provide the Service and as required by applicable retention obligations.
- Enable export, sharing, and retrieval of reports as directed by you through the Service interface or API.
- Provide customer support and resolve technical issues.

Scope limitation:
We will process Personal Data only as necessary to perform these instructions and deliver the Service. If we believe an instruction violates applicable Data Protection Laws, we will inform you and, where legally required, refuse to carry out that instruction.`,
  },
  {
    id: 'security',
    title: '4. Security Measures',
    content: `FlacronAI implements appropriate technical and organizational measures to protect Personal Data against unauthorized or unlawful processing, accidental loss, destruction, or damage, including:

Technical measures:
- Encryption of Personal Data in transit (TLS 1.2+) and at rest (AES-256).
- Access controls and authentication (password hashing, multi-factor authentication where enabled).
- Regular security testing and vulnerability assessments.
- Logging and monitoring of access to Personal Data.

Organizational measures:
- Limiting access to Personal Data to authorized personnel who need it to perform their duties.
- Confidentiality obligations for all personnel with access to Personal Data.
- Security training for employees handling Personal Data.
- Incident response procedures for detecting, reporting, and responding to data breaches.

For a full description of our security practices, see the Security page at [flacronai.com/security].`,
  },
  {
    id: 'sub-processors',
    title: '5. Sub-processors',
    content: `Use of Sub-processors:
You authorize FlacronAI to engage Sub-processors to assist in processing Personal Data. All Sub-processors are bound by written agreements requiring them to provide at least the same level of data protection as this DPA.

Current Sub-processors:
A list of Sub-processors currently engaged by FlacronAI is available at [flacronai.com/subprocessors]. This list includes the Sub-processor name, location, and the service provided.

Changes to Sub-processors:
We will notify you at least 30 days before adding or replacing a Sub-processor by updating the Subprocessors list and sending an email notification to your account email address.

Objection right:
If you have legitimate grounds to object to a new or replacement Sub-processor based on Data Protection Law requirements, you may notify us in writing within 30 days of receiving notice. If we cannot accommodate your objection, you may terminate the affected Service without penalty by providing written notice within that 30-day period.`,
  },
  {
    id: 'data-subject-rights',
    title: '6. Data Subject Rights',
    content: `Your obligations:
As Controller, you are responsible for responding to Data Subject requests to exercise their rights under applicable Data Protection Laws (right to access, rectification, deletion, restriction, portability, objection).

Our assistance:
FlacronAI will assist you in fulfilling Data Subject requests to the extent required by Data Protection Laws and to the extent possible given the nature of the Service. This assistance includes:
- Providing you with the ability to access, retrieve, correct, and delete Personal Data through the Service interface or API.
- Responding to your requests for assistance within a reasonable timeframe (typically within 10 business days).

Direct Data Subject requests:
If we receive a Data Subject request directly (rather than through you), we will forward it to you without undue delay and will not respond to the Data Subject directly unless legally required to do so.`,
  },
  {
    id: 'data-breaches',
    title: '7. Data Breaches',
    content: `Notification obligation:
If we become aware of a Personal Data breach affecting your data, we will notify you without undue delay and in any event within 72 hours of becoming aware of the breach.

Breach notification content:
Our notification will include, to the extent known at the time:
- A description of the nature of the breach, including the categories and approximate number of Data Subjects and Personal Data records affected.
- The likely consequences of the breach.
- Measures taken or proposed to address the breach and mitigate its effects.
- Contact information for further inquiries.

Your obligations:
You remain responsible for complying with any applicable breach notification obligations under Data Protection Laws, including notifying Data Subjects and supervisory authorities where required.`,
  },
  {
    id: 'data-retention-deletion',
    title: '8. Data Retention and Deletion',
    content: `Retention period:
We retain Personal Data for as long as your account is active and as necessary to provide the Service. Specific retention periods:
- Active reports and claim data: retained while your account is active.
- Deleted reports: moved to a "trash" state for 30 days before permanent deletion.
- Account closure: all Personal Data is deleted within 90 days of account termination unless we are required to retain it for legal, compliance, or security purposes.

Deletion upon termination:
Upon termination of the Service or upon your written request, we will delete or return all Personal Data in our possession or control, except where retention is required by applicable law.

Return of data:
At your request and before deletion, we will provide you with a copy of your Personal Data in a commonly used, machine-readable format (JSON or CSV).`,
  },
  {
    id: 'audits',
    title: '9. Audits and Compliance',
    content: `Audit rights:
You have the right to audit our compliance with this DPA, subject to the following conditions:
- Audits may be conducted no more than once per year unless required by a supervisory authority.
- You must provide at least 30 days' written notice.
- Audits must be conducted during normal business hours and in a manner that does not unreasonably interfere with our operations.
- You must execute a confidentiality agreement before the audit.

Audit information:
Instead of an on-site audit, we may provide you with:
- Copies of relevant third-party audit reports, certifications, or attestations (e.g., SOC 2 Type II, ISO 27001, when available).
- Written responses to reasonable compliance questionnaires.

Costs:
You are responsible for all costs associated with audits you conduct. We may charge a reasonable fee for time spent facilitating the audit or providing information.`,
  },
  {
    id: 'international-transfers',
    title: '10. International Data Transfers',
    content: `Primary data location:
Personal Data is primarily stored and processed in the United States.

Transfers outside the EEA/UK:
If you are located in the European Economic Area (EEA), the United Kingdom, or Switzerland, and Personal Data is transferred to the United States or other jurisdictions not recognized as providing an adequate level of data protection, we rely on one or more of the following transfer mechanisms:
- Standard Contractual Clauses (SCCs) approved by the European Commission.
- Your explicit consent, where applicable.
- Adequacy decisions, where available.

Standard Contractual Clauses:
Upon request, we will execute the European Commission's Standard Contractual Clauses (Controller-to-Processor) with you. Contact legal@flacronenterprises.com to request execution.`,
  },
  {
    id: 'liability',
    title: '11. Limitation of Liability',
    content: `Liability cap:
Each party's total aggregate liability under this DPA is subject to the limitation of liability provisions in the Terms of Service.

GDPR-specific liability:
To the extent required by Article 82 of the GDPR, each party is liable for damages caused by processing that violates the GDPR, except where that party proves it is not responsible for the event giving rise to the damage.`,
  },
  {
    id: 'term-termination',
    title: '12. Term and Termination',
    content: `Term:
This DPA remains in effect for as long as we process Personal Data on your behalf.

Termination:
This DPA automatically terminates when:
- Your subscription to the Service ends and all Personal Data has been deleted or returned as described in Section 8.
- You and FlacronAI mutually agree in writing to terminate.

Survival:
Sections concerning confidentiality, liability, and data deletion obligations survive termination.`,
  },
  {
    id: 'amendments',
    title: '13. Amendments',
    content: `We may update this DPA from time to time to reflect changes in Data Protection Laws, our data processing practices, or Sub-processors. Material changes will be communicated to you at least 30 days before they take effect via email and a notice on the platform.

Continued use of the Service after the effective date of an amended DPA constitutes your acceptance of the changes. If you do not agree, you must discontinue use of the Service.`,
  },
  {
    id: 'contact',
    title: '14. Contact and Data Protection Officer',
    content: `For questions about this Data Processing Agreement or to exercise your audit rights, contact:

Legal inquiries: legal@flacronenterprises.com
Data protection inquiries: privacy@flacronenterprises.com
Address: Flacron Enterprises LLC, Tampa, Florida, United States

[CLIENT TO CONFIRM: Has a Data Protection Officer been appointed? If yes, provide contact details here.]`,
  },
];

const DataProcessingAgreement = () => {
  return (
    <div className="bg-bg min-h-screen">
      <Seo
        title="Data Processing Agreement — FlacronAI"
        description="FlacronAI's Data Processing Agreement governing how we process personal data on behalf of our customers under GDPR and other data protection laws."
        path="/data-processing-agreement"
      />
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Data Processing Agreement</h1>
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-8 pb-8 border-b border-border">
            <span>Last updated: <strong className="text-gray-600">March 1, 2026</strong></span>
            <span>•</span>
            <span>Effective: <strong className="text-gray-600">March 1, 2026</strong></span>
          </div>

          <div className="mb-8 p-5 bg-blue-50 border border-blue-200 rounded-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Important</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              This Data Processing Agreement (DPA) governs how FlacronAI processes personal data on behalf of customers who act as data controllers. It applies when you submit personal data (such as claimant names, property addresses, or contact information) to the Service. By using the Service, you agree to this DPA.
            </p>
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
                  <p className="text-gray-600 leading-relaxed whitespace-pre-line">{section.content}</p>
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

export default DataProcessingAgreement;
