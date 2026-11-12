import type { IconName } from '@/components/ui/Icon';

/** Mobile tour version. Completion is stored server-side in `productTourMobile` (separate from the web's
 * `productTour`), so finishing the web tour never hides the mobile tour from a first-time app user. */
export const TOUR_VERSION = 1;

/** Visible tabs, left to right (Settings is a hidden route). */
export const TAB_ORDER = ['dashboard', 'reports', 'generate', 'library', 'more'] as const;

export type TourTarget = { kind: 'control'; id: string } | { kind: 'tab'; tab: (typeof TAB_ORDER)[number] };

export interface TourStep {
  /** Must match `^[a-z0-9-]{1,40}$` (backend/utils/productTour.js). */
  id: string;
  title: string;
  body: string;
  icon: IconName;
  /** The on-screen control this step points at; omitted for the intro and finish cards. */
  target?: TourTarget;
}

/** Copy follows the web tour (Super Intelligence wording, "nothing is final until a person reviews it"). Every
 * targeted step spotlights a control that is on screen when the tour runs (Dashboard + tab bar). */
export function buildTourSteps(tier?: string | null): TourStep[] {
  const team = tier === 'agency' || tier === 'enterprise';
  return [
    {
      id: 'welcome',
      icon: 'zap',
      title: 'Welcome to FlacronAI',
      body: 'Create professional inspection reports from photos and claim details — drafted by Super Intelligence, reviewed and approved by you. Here’s a one-minute tour of the app.',
    },
    {
      id: 'nav-generate',
      icon: 'plus-circle',
      title: 'Start a new inspection',
      body: 'Start here: enter the claim and property details, take or choose photos, and Super Intelligence drafts the report. Nothing is final until a person reviews it.',
      target: { kind: 'control', id: 'generate-cta' },
    },
    {
      id: 'usage-card',
      icon: 'bar-chart-2',
      title: 'Your plan and usage',
      body: 'Reports used this month, your limit and what is left on your plan.',
      target: { kind: 'control', id: 'usage-card' },
    },
    {
      id: 'nav-notifications',
      icon: 'bell',
      title: 'Notifications',
      body: 'Analysis results, review requests and approvals arrive here.',
      target: { kind: 'control', id: 'notification-bell' },
    },
    {
      id: 'nav-search',
      icon: 'search',
      title: 'Search everything',
      body: 'Find reports, photos and teammates by claim number, name or address.',
      target: { kind: 'control', id: 'search-button' },
    },
    {
      id: 'nav-reports',
      icon: 'file-text',
      title: 'Projects',
      body: 'Every inspection report: search, filter by status and bulk-archive. Open one to review each photo observation, edit the draft, approve it and export or share it.',
      target: { kind: 'tab', tab: 'reports' },
    },
    {
      id: 'nav-generate-tab',
      icon: 'plus-circle',
      title: 'New inspection from anywhere',
      body: 'The orange + starts a new report from any screen.',
      target: { kind: 'tab', tab: 'generate' },
    },
    {
      id: 'nav-library',
      icon: 'file-text',
      title: 'Reports',
      body: 'Reviewed and approved reports, ready to download as PDF or share.',
      target: { kind: 'tab', tab: 'library' },
    },
    {
      id: 'nav-more',
      icon: 'more-horizontal',
      title: 'More',
      body: team
        ? 'Analytics, templates, usage & billing, settings, your team and CRM, and Help — including “Replay app tour”.'
        : 'Analytics, templates, usage & billing, settings and Help — including “Replay app tour”.',
      target: { kind: 'tab', tab: 'more' },
    },
    {
      id: 'finish',
      icon: 'check-circle',
      title: 'You’re all set',
      body: 'Start your first inspection whenever you are ready. The menu button at the top opens every section of the app.',
    },
  ];
}
