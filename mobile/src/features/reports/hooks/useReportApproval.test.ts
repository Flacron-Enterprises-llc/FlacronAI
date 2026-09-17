import { renderHook, act } from '@testing-library/react-native';

import type { Report } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';
import { isApprovalEligible, useReportApproval } from './useReportApproval';

const mockApprove = jest.fn();
jest.mock('@/services/api/reports', () => ({
  reportsApi: { approve: (...args: unknown[]) => mockApprove(...args) },
}));

const baseReport: Report = {
  id: 'r1',
  userId: 'u1',
  claimNumber: 'CLM-1',
  insuredName: 'Jordan Rivera',
  insuredEmail: 'jordan@example.com',
  propertyAddress: '123 Main St',
  lossDate: '2026-01-01',
  lossType: 'Water Damage',
  reportType: 'Initial',
  content: 'Draft content',
  imageCount: 1,
  status: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('isApprovalEligible — mirrors the backend\'s own approve-route rejection rules', () => {
  it('is eligible for an ordinary draft report', () => {
    expect(isApprovalEligible(baseReport)).toBe(true);
  });

  it('is not eligible while the AI pipeline is still processing (matches REPORT_PROCESSING)', () => {
    expect(isApprovalEligible({ ...baseReport, status: 'processing' })).toBe(false);
  });

  it('is not eligible mid-regeneration (matches REPORT_REGENERATING)', () => {
    expect(isApprovalEligible({ ...baseReport, regenerating: true })).toBe(false);
  });

  it('is not eligible when there is no report yet', () => {
    expect(isApprovalEligible(null)).toBe(false);
  });
});

describe('useReportApproval — duplicate-tap prevention', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ignores a second approve() call while the first is still in flight', async () => {
    let resolveFirst: (v: { success: true; message: string; report: Report }) => void = () => {};
    mockApprove.mockReturnValue(new Promise((resolve) => { resolveFirst = resolve; }));

    const onApproved = jest.fn();
    const { result } = await renderHook(() => useReportApproval('r1', onApproved));

    const signature = { name: 'Jane Doe', licenseNumber: 'L1', licenseState: 'CA', company: 'Acme' };
    let firstCall!: Promise<boolean | undefined>;
    await act(async () => {
      firstCall = result.current.approve(signature);
      await Promise.resolve(); // let the synchronous portion of approve() (setSubmitting(true)) flush
    });
    expect(result.current.submitting).toBe(true);

    await act(async () => {
      await result.current.approve(signature); // second tap while the first hasn't resolved yet
    });

    expect(mockApprove).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ success: true, message: 'ok', report: { ...baseReport, status: 'finalized' } });
      await firstCall;
    });
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it('surfaces the backend\'s own safe error message on failure and allows a retry', async () => {
    mockApprove.mockRejectedValueOnce(
      new ApiRequestError('Full name, license number, license state, and company/firm are required to approve a report.', {
        category: 'validation',
        status: 400,
        code: 'SIGNATURE_INCOMPLETE',
      })
    );
    const { result } = await renderHook(() => useReportApproval('r1', jest.fn()));

    await act(async () => {
      await result.current.approve({ name: '', licenseNumber: '', licenseState: '', company: '' });
    });

    expect(result.current.error).toBe('Full name, license number, license state, and company/firm are required to approve a report.');
    expect(result.current.submitting).toBe(false);
  });
});
