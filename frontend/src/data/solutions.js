// Phase 23: persona data for the /solutions index + /solutions/:slug detail pages.
// Every claim here is a real, already-shipped capability (Golden Rule #1) —
// no invented integrations, certifications, or accuracy figures.

const SOLUTIONS = [
  {
    slug: 'independent-adjusters',
    name: 'Independent Adjusters',
    tagline: 'Draft reports between inspections, not after hours.',
    summary:
      'Turn claim details and field photos into a structured draft while you’re still in the car — review and approve it before it goes to the carrier or TPA.',
    painPoints: [
      'Writing up reports at night after a full day of inspections',
      'Re-typing the same claim structure for every file',
      'No easy way to hand a reviewer a clean, consistent draft',
    ],
    features: [
      { title: 'Automated Drafting', desc: 'Claim details and up to 100 photos become a structured draft in minutes, not hours.' },
      { title: 'Mobile Photo Capture', desc: 'Take photos or choose from your library directly in the wizard on your phone.' },
      { title: 'Multi-Format Export', desc: 'Export to PDF or DOCX for the carrier, or share a secure link.' },
    ],
    suggestedTier: 'Starter or Professional',
  },
  {
    slug: 'adjusting-firms',
    name: 'Adjusting Firms',
    tagline: 'Consistent report structure across every adjuster on staff.',
    summary:
      'Give every adjuster the same starting template and review workflow, then track report volume and turnaround across the whole team.',
    painPoints: [
      'Every adjuster formats reports differently',
      'No visibility into who’s behind on drafts',
      'Onboarding a new adjuster means re-explaining your report standard from scratch',
    ],
    features: [
      { title: 'Report Templates', desc: 'A shared structural template keeps every adjuster’s report in the same format.' },
      { title: 'Team Roles & Permissions', desc: 'Assign Adjuster, Reviewer, or Manager roles with server-enforced permissions.' },
      { title: 'Usage Analytics', desc: 'See reports generated and photos analyzed per team member, organization-wide.' },
    ],
    suggestedTier: 'Agency or Enterprise',
  },
  {
    slug: 'insurance-carriers',
    name: 'Insurance Carriers',
    tagline: 'A consistent draft format from every independent adjuster you assign.',
    summary:
      'Point your IA network at one drafting tool so every report that reaches your desk follows the same structure, whoever wrote it.',
    painPoints: [
      'Inconsistent report formats from different independent adjusters',
      'No standard way to confirm a photo set was actually reviewed by a person',
      'Manually reformatting drafts before they go into your claim file',
    ],
    features: [
      { title: 'FLACRON ENGINE Drafting', desc: 'The same structured report format regardless of which adjuster generated it.' },
      { title: 'Human Review Gate', desc: 'Every export is labeled Draft or Finalized, with a recorded reviewer and approval timestamp.' },
      { title: 'White-Label Portal', desc: 'Enterprise clients can present a fully branded portal for their own adjuster network.' },
    ],
    suggestedTier: 'Enterprise',
  },
  {
    slug: 'tpas',
    name: 'Third-Party Administrators',
    tagline: 'Route claims to adjusters who all draft in the same format.',
    summary:
      'Coordinate claims across an adjuster network with claim-level tracking and a report format that stays consistent no matter who’s assigned.',
    painPoints: [
      'Coordinating dozens of adjusters on inconsistent tooling',
      'No shared view of claim status across the network',
      'Reports arrive in different formats depending on who wrote them',
    ],
    features: [
      { title: 'CRM & Claims Workspace', desc: 'Track clients, appointments, and claims linked to their reports in one place.' },
      { title: 'Report Templates', desc: 'One structural template, personal, organization, or Flacron-provided.' },
      { title: 'Team Roles & Permissions', desc: 'Assign reviewers across a network without giving everyone full account access.' },
    ],
    suggestedTier: 'Agency or Enterprise',
  },
  {
    slug: 'inspection-companies',
    name: 'Inspection Companies',
    tagline: 'From a completed inspection to a reviewed report, without retyping anything.',
    summary:
      'Feed your inspection photos and notes straight into a structured draft, then let a qualified reviewer sign off before it ships to the client.',
    painPoints: [
      'Inspection notes and photos live in one tool, the report gets written in another',
      'No consistent place to flag which photos actually support which finding',
      'Manually assembling a photo appendix for every report',
    ],
    features: [
      { title: 'Photo Analysis', desc: 'Every submitted photo is available for structured review — location, category, severity, and your notes.' },
      { title: 'Photo Library', desc: 'Filter, search, and review analyzed photos across every report in one place.' },
      { title: 'Multi-Format Export', desc: 'A deterministic photo appendix is included automatically in every export.' },
    ],
    suggestedTier: 'Professional or Agency',
  },
  {
    slug: 'restoration-companies',
    name: 'Restoration Companies',
    tagline: 'Document the loss and hand the carrier a clean, structured draft.',
    summary:
      'Capture pre- and post-mitigation photos and claim details, then generate a documentation draft your team reviews before it goes out.',
    painPoints: [
      'Field crews collect photos, someone else has to write them up later',
      'No consistent structure to loss-documentation reports across jobs',
      'Carriers push back on informal or inconsistent documentation',
    ],
    features: [
      { title: 'Mobile Photo Capture', desc: 'Crews capture photos directly from a phone during the job.' },
      { title: 'Automated Drafting', desc: 'Claim and loss details plus photos become a structured draft automatically.' },
      { title: 'Report Templates', desc: 'Standardize on one documentation format across every job.' },
    ],
    suggestedTier: 'Professional or Agency',
  },
  {
    slug: 'contractors',
    name: 'Contractors',
    tagline: 'Back up your scope of work with organized, reviewed documentation.',
    summary:
      'Turn job-site photos and notes into a structured draft that supports your scope of work and estimate conversation with the carrier.',
    painPoints: [
      'No organized way to document existing damage before starting work',
      'Photos scattered across phones with no structure',
      'Needing a professional-looking document to support a scope discussion',
    ],
    features: [
      { title: 'Photo Analysis', desc: 'Upload up to 100 job-site photos; every one is available for structured review.' },
      { title: 'Multi-Format Export', desc: 'Export a professional PDF or DOCX to support your scope of work.' },
      { title: 'CRM Integration', desc: 'Track clients and claims linked to your reports automatically.' },
    ],
    suggestedTier: 'Starter or Professional',
  },
];

export const getSolution = (slug) => SOLUTIONS.find((s) => s.slug === slug);

export default SOLUTIONS;
