import type { IconName } from '@/components/ui/Icon';

/** Same version number as frontend/src/tour/tourSteps.js — completion is one server field shared by web and mobile. */
export const TOUR_VERSION = 1;

export interface TourStep {
  /** Must match `^[a-z0-9-]{1,40}$` (backend/utils/productTour.js). */
  id: string;
  title: string;
  body: string;
  icon: IconName;
  /** Where the feature lives in the app. */
  where?: string;
}

/** Copy follows the web tour (Super Intelligence wording, "nothing is final until a person reviews it"), pointed at the
 * mobile navigation instead of the web sidebar. */
export function buildTourSteps(tier?: string | null): TourStep[] {
  const steps: TourStep[] = [
    {
      id: 'welcome',
      icon: 'zap',
      title: 'Welcome to FlacronAI',
      body: 'Create professional inspection reports from photos and claim details — drafted by Super Intelligence, reviewed and approved by you. Here’s a one-minute tour.',
    },
    {
      id: 'nav-generate',
      icon: 'plus-circle',
      title: 'Generate a report',
      body: 'Start here: enter the claim and property details, take or choose your photos, and Super Intelligence drafts the report sections for you. Nothing is final until a person reviews it.',
      where: 'Generate tab, or “Generate Report” on the Dashboard',
    },
    {
      id: 'usage-card',
      icon: 'bar-chart-2',
      title: 'Your plan and usage',
      body: 'See how many reports you have used this month and what your plan includes.',
      where: 'Dashboard → plan card',
    },
    {
      id: 'nav-reports',
      icon: 'file-text',
      title: 'My Reports',
      body: 'Search and filter your reports, review each photo observation, edit the draft, approve it with your signature and export or share it.',
      where: 'Reports tab',
    },
    {
      id: 'nav-notifications',
      icon: 'bell',
      title: 'Stay up to date',
      body: 'Analysis results, review requests and approvals arrive in your notifications — and as push notifications if you turn them on.',
      where: 'Bell at the top of the Dashboard',
    },
    {
      id: 'nav-more',
      icon: 'grid',
      title: 'Everything else',
      body:
        tier === 'agency' || tier === 'enterprise'
          ? 'Analytics, templates, usage & billing, help — plus quick links to CRM and team tools on flacronai.com.'
          : 'Analytics, templates, usage & billing, settings and help.',
      where: 'More tab',
    },
    {
      id: 'help-menu',
      icon: 'help-circle',
      title: 'Replay this tour any time',
      body: 'Open More → Help & support and choose “Replay app tour”.',
      where: 'More → Help & support',
    },
    {
      id: 'finish',
      icon: 'check-circle',
      title: 'You’re all set',
      body: 'Generate your first report whenever you are ready.',
    },
  ];
  return steps;
}
