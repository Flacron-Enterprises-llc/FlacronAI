// Interactive app tour: which steps a user sees, personalized by plan, team
// role, what they told us in onboarding, and whether they are the platform
// admin. Pure data -- ProductTour.jsx renders it and finds each `target` on the
// real screen (elements marked `data-tour="..."`).
//
// Bump TOUR_VERSION when the tour changes enough that everyone should see it
// once more; the dashboard starts it by itself for anyone whose stored
// productTour.version is lower (backend/utils/productTour.js).

export const TOUR_VERSION = 1;

// Mirrors backend/utils/orgRoles.js ROLES (capabilities only).
const ROLE_CAPS = {
  owner: { generate: true, approve: true, templates: true, team: true, billing: true, integrations: true },
  admin: { generate: true, approve: true, templates: true, team: true, billing: false, integrations: true },
  manager: { generate: true, approve: true, templates: true, team: true, billing: false, integrations: false },
  adjuster: { generate: true, approve: true, templates: false, team: false, billing: false, integrations: false },
  inspector: { generate: true, approve: false, templates: false, team: false, billing: false, integrations: false },
  reviewer: { generate: false, approve: true, templates: false, team: false, billing: false, integrations: false },
  viewer: { generate: false, approve: false, templates: false, team: false, billing: false, integrations: false },
  editor: { generate: true, approve: true, templates: false, team: false, billing: false, integrations: false },
};

export const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  adjuster: 'Adjuster',
  inspector: 'Inspector',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
  editor: 'Editor',
};

const PLAN_LABELS = { starter: 'Starter', professional: 'Professional', agency: 'Agency', enterprise: 'Enterprise' };

// Same formula as backend resolveRole(): a solo account (or a team's owner) is
// the owner; a team member has the role their team gave them.
export function resolveTourRole(profile, uid) {
  if (!profile) return 'viewer';
  const ownerId = profile.teamOwnerId;
  if (!ownerId || ownerId === uid) return 'owner';
  return ROLE_CAPS[profile.teamRole] ? profile.teamRole : 'viewer';
}

const WELCOME_BY_TYPE = {
  independent_adjuster: 'Turn your inspection photos and notes into a review-ready report draft, then edit, approve and export it.',
  adjusting_company: 'Keep every adjuster’s reports consistent with shared templates, team review and one place for all claims.',
  insurance_company: 'Get consistent, review-ready inspection reports from your field teams, with a human sign-off on every one.',
  inspector: 'Capture photos and claim details on site; Super Intelligence drafts the report for a licensed adjuster to review.',
  contractor: 'Document damage and scope with photo-backed reports you can share with adjusters and homeowners.',
};

/**
 * @param {object} ctx
 * @param {string} [ctx.firstName]
 * @param {string} [ctx.tier] starter | professional | agency | enterprise
 * @param {string} [ctx.role] see ROLE_CAPS
 * @param {string} [ctx.userType] onboarding answer (utils/onboarding.js)
 * @param {string} [ctx.company]
 * @param {boolean} [ctx.isPlatformAdmin]
 * @param {boolean} [ctx.hasSupportChat] the Growth Engine chat launcher is on the page
 * @returns {Array<{id:string,title:string,body:string,target?:string,mobileTarget?:string,surface?:'sidebar'|'navbar',cta?:'generate'}>}
 */
export function buildTourSteps({ firstName, tier = 'starter', role = 'owner', userType, company, isPlatformAdmin = false, hasSupportChat = false } = {}) {
  const caps = ROLE_CAPS[role] || ROLE_CAPS.viewer;
  const paidTeamTier = tier === 'agency' || tier === 'enterprise';
  const isMember = role !== 'owner';
  const hi = firstName ? `Welcome to FlacronAI, ${firstName}` : 'Welcome to FlacronAI';
  const steps = [];

  steps.push({
    id: 'welcome',
    title: hi,
    body: isMember
      ? `You’re on ${company ? `${company}’s` : 'your organization’s'} team as ${ROLE_LABELS[role]}. This quick tour shows the parts of FlacronAI you’ll use — it takes about a minute.`
      : `${WELCOME_BY_TYPE[userType] || 'Create professional inspection reports from photos and claim details — drafted by Super Intelligence, reviewed and approved by you.'} Here’s a one-minute tour.`,
  });

  if (caps.generate) {
    steps.push({
      id: 'nav-generate',
      target: '[data-tour="nav-generate"]',
      surface: 'sidebar',
      title: 'Generate a report',
      body: 'Start here: enter the claim and property details, upload your photos, and Super Intelligence drafts the report sections for you. Nothing is final until a person reviews it.',
    });
  }

  steps.push({
    id: 'usage-card',
    target: '[data-tour="usage-card"]',
    surface: 'sidebar',
    title: 'Your plan and usage',
    body: isMember
      ? 'See how many reports you’ve created this month. Your organization manages the plan and its limits.'
      : `You’re on the ${PLAN_LABELS[tier] || 'Starter'} plan. This card shows reports used this month and what’s left${tier === 'starter' ? ' — upgrade any time for more reports without a watermark' : ''}.`,
  });

  steps.push({
    id: 'nav-reports',
    target: '[data-tour="nav-reports"]',
    surface: 'sidebar',
    title: caps.approve && !caps.generate ? 'Reports waiting for your review' : 'My Reports',
    body: caps.approve
      ? 'Every draft lands here. Open one to edit sections, accept or reject each photo observation, then Approve & Finalize to export a clean PDF or DOCX.'
      : caps.generate
        ? 'Your drafts land here. Edit them and send them for review — a reviewer approves and finalizes them before export.'
        : 'Finalized reports shared with you are here to read and download.',
  });

  if (caps.generate) {
    steps.push({
      id: 'nav-templates',
      target: '[data-tour="nav-templates"]',
      surface: 'sidebar',
      title: 'Templates',
      body: caps.templates
        ? 'Build report templates with your own sections and wording so every report follows your format.'
        : 'Use your organization’s report templates so your reports follow the team format.',
    });
  }

  steps.push({
    id: 'nav-analytics',
    target: '[data-tour="nav-analytics"]',
    surface: 'sidebar',
    title: 'Analytics',
    body: 'Track report volume, turnaround and review status over time.',
  });

  if (paidTeamTier && caps.generate) {
    steps.push({
      id: 'nav-crm',
      target: '[data-tour="nav-crm"]',
      surface: 'sidebar',
      title: 'CRM',
      body: 'Keep clients, claims and appointments together, and link each report to its claim.',
    });
  }

  if (caps.integrations) {
    steps.push({
      id: 'nav-integrations',
      target: '[data-tour="nav-integrations"]',
      surface: 'sidebar',
      title: 'Integrations',
      body: paidTeamTier
        ? 'Connect FlacronAI to your other systems with webhooks and API keys.'
        : 'Connect FlacronAI to your other systems with webhooks. API access comes with the Agency and Enterprise plans.',
    });
  }

  if (tier === 'enterprise' && caps.team) {
    steps.push({
      id: 'nav-organization',
      target: '[data-tour="nav-organization"]',
      surface: 'sidebar',
      title: 'Your organization',
      body: 'Invite teammates, assign roles (adjuster, inspector, reviewer…) and manage who can approve and export reports.',
    });
  }

  if (caps.billing) {
    steps.push({
      id: 'nav-billing',
      target: '[data-tour="nav-billing"]',
      surface: 'sidebar',
      title: 'Usage & Billing',
      body: 'Change plans, update your payment method and download invoices.',
    });
  }

  steps.push({
    id: 'nav-settings',
    target: '[data-tour="nav-settings"]',
    surface: 'sidebar',
    title: 'Settings',
    body: caps.billing || role === 'admin'
      ? 'Your profile, company branding for exports, notifications and security — we recommend turning on two-factor sign-in.'
      : 'Your profile, notifications and security — we recommend turning on two-factor sign-in.',
  });

  if (hasSupportChat) {
    steps.push({
      id: 'support-chat',
      target: '[data-fcge-chat]',
      title: 'Questions? Chat with us',
      body: 'Our team answers right here. You can close the chat and come back — your conversation is kept.',
    });
  }

  steps.push({
    id: 'help-menu',
    target: '[data-tour="account-menu"]',
    mobileTarget: '[data-tour="mobile-menu"]',
    surface: 'navbar',
    title: 'Replay this tour any time',
    body: 'Open the menu at the top right and choose “Replay app tour”, or go to Settings → Help.',
  });

  if (isPlatformAdmin) {
    steps.push({
      id: 'platform-admin',
      title: 'Admin console',
      body: 'As the platform admin you also have the Admin console (/admin) for users, plans and sales leads. It isn’t part of this dashboard.',
    });
  }

  steps.push({
    id: 'finish',
    title: 'You’re all set',
    body: caps.generate
      ? 'Create your first report now — it takes a few minutes, and you can save a draft and come back.'
      : 'That’s everything. Your reports list is the best place to start.',
    cta: caps.generate ? 'generate' : undefined,
  });

  return steps;
}
