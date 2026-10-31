import type { Report, ReportAccess } from '@/services/api/reports';
import { getReportActions } from './reportActions';

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    userId: 'owner-uid',
    claimNumber: 'CLM-1',
    insuredName: 'A',
    insuredEmail: 'a@example.com',
    propertyAddress: '1 Main',
    lossDate: '2026-01-01',
    lossType: 'Fire',
    reportType: 'Initial',
    content: 'Draft content',
    imageCount: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const actionsFor = (r: Report, access: ReportAccess, uid = 'owner-uid') => getReportActions(r, access, uid);

describe('getReportActions — approve gating mirrors POST /:id/approve', () => {
  it('owner and review grantees may approve a draft with content; view/comment may not', () => {
    expect(actionsFor(report(), 'owner').canApprove).toBe(true);
    expect(actionsFor(report(), 'review', 'reviewer').canApprove).toBe(true);
    expect(actionsFor(report(), 'comment', 'x').canApprove).toBe(false);
    expect(actionsFor(report(), 'view', 'x').canApprove).toBe(false);
  });

  it.each(['processing', 'failed', 'archived', 'finalized', 'approved', 'completed'] as const)(
    'is not offered for status %s',
    (status) => {
      const a = actionsFor(report({ status }), 'owner');
      expect(a.canApprove).toBe(false);
      expect(a.approveNote).toBeTruthy();
    }
  );

  it('is not offered while regenerating or when there is no content', () => {
    expect(actionsFor(report({ regenerating: true }), 'owner').canApprove).toBe(false);
    expect(actionsFor(report({ content: null }), 'owner').canApprove).toBe(false);
  });

  it('reports an already-reviewed report as reviewed', () => {
    expect(actionsFor(report({ status: 'finalized' }), 'owner').isReviewed).toBe(true);
    expect(actionsFor(report({ status: 'draft' }), 'owner').isReviewed).toBe(false);
  });
});

describe('getReportActions — export gating mirrors POST /:id/export', () => {
  it('only the owner may export', () => {
    expect(actionsFor(report(), 'owner').canExport).toBe(true);
    for (const access of ['review', 'comment', 'view'] as const) {
      const a = actionsFor(report(), access, 'someone-else');
      expect(a.canExport).toBe(false);
      expect(a.exportNote).toMatch(/owner/);
    }
  });

  it.each(['processing', 'failed', 'archived'] as const)('is unavailable for status %s', (status) => {
    expect(actionsFor(report({ status, content: status === 'failed' ? null : 'x' }), 'owner').canExport).toBe(false);
  });

  it('a finalized report exports', () => {
    expect(actionsFor(report({ status: 'finalized' }), 'owner').canExport).toBe(true);
  });
});

describe('getReportActions — retry analysis', () => {
  it('owner can retry a failed report, or one with photos needing attention', () => {
    expect(actionsFor(report({ status: 'failed', content: null }), 'owner').canRetryAnalysis).toBe(true);
    expect(
      actionsFor(report({ photos: [{ id: 'p', analysisStatus: 'needs_attention' }] }), 'owner').canRetryAnalysis
    ).toBe(true);
    expect(actionsFor(report(), 'owner').canRetryAnalysis).toBe(false);
  });

  it('never for a non-owner or while processing', () => {
    expect(actionsFor(report({ status: 'failed', content: null }), 'review', 'r').canRetryAnalysis).toBe(false);
    expect(
      actionsFor(report({ status: 'processing', photos: [{ id: 'p', analysisStatus: 'needs_attention' }] }), 'owner')
        .canRetryAnalysis
    ).toBe(false);
  });
});

describe('getReportActions — review response, comments, photo review', () => {
  const pending = { reviewerUid: 'reviewer', status: 'pending' as const };

  it('only the named reviewer of a pending request may respond', () => {
    expect(actionsFor(report({ reviewRequest: pending }), 'review', 'reviewer').canRespondToReview).toBe(true);
    expect(actionsFor(report({ reviewRequest: pending }), 'review', 'other-reviewer').canRespondToReview).toBe(false);
    expect(actionsFor(report({ reviewRequest: pending }), 'owner', 'owner-uid').canRespondToReview).toBe(false);
    expect(
      actionsFor(report({ reviewRequest: { ...pending, status: 'changes_requested' } }), 'review', 'reviewer').canRespondToReview
    ).toBe(false);
  });

  it('comment access or higher may comment; only owner/review may review photos', () => {
    expect(actionsFor(report(), 'view', 'x').canComment).toBe(false);
    expect(actionsFor(report(), 'comment', 'x').canComment).toBe(true);
    expect(actionsFor(report(), 'comment', 'x').canReviewPhotos).toBe(false);
    expect(actionsFor(report(), 'review', 'x').canReviewPhotos).toBe(true);
    expect(actionsFor(report(), 'owner').canReviewPhotos).toBe(true);
  });

  it('grants nothing without a report or an access level', () => {
    expect(getReportActions(null, 'owner', 'u').canApprove).toBe(false);
    expect(getReportActions(report(), null, 'u').canComment).toBe(false);
  });
});

describe('getReportActions — edit / share / owner mirror PUT /:id and the owner-only routes', () => {
  it('owner and review grantees may edit a draft; view/comment may not', () => {
    expect(actionsFor(report(), 'owner').canEdit).toBe(true);
    expect(actionsFor(report(), 'review', 'reviewer').canEdit).toBe(true);
    expect(actionsFor(report(), 'comment', 'x').canEdit).toBe(false);
    expect(actionsFor(report(), 'view', 'x').canEdit).toBe(false);
  });

  it('finalized, processing, regenerating, archived and failed reports are not editable', () => {
    for (const r of [
      report({ status: 'finalized' }),
      report({ status: 'processing', content: null }),
      report({ regenerating: true }),
      report({ status: 'archived' }),
      report({ status: 'failed', content: null }),
    ]) {
      expect(actionsFor(r, 'owner').canEdit).toBe(false);
    }
  });

  it('editing a legacy approved/completed report is allowed but flagged as reopening it', () => {
    const a = actionsFor(report({ status: 'approved' }), 'owner');
    expect(a.canEdit).toBe(true);
    expect(a.editReopens).toBe(true);
    expect(actionsFor(report(), 'owner').editReopens).toBe(false);
  });

  it('share and manage actions are owner-only, and no new links for archived reports', () => {
    expect(actionsFor(report(), 'owner').canShare).toBe(true);
    expect(actionsFor(report(), 'owner').isOwner).toBe(true);
    expect(actionsFor(report(), 'review', 'reviewer').canShare).toBe(false);
    expect(actionsFor(report(), 'review', 'reviewer').isOwner).toBe(false);
    expect(actionsFor(report({ status: 'archived' }), 'owner').canShare).toBe(false);
  });
});
