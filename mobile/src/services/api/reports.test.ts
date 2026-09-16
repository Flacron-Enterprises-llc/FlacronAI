import { reportsApi, type RNFile } from './reports';

const mockApiRequest = jest.fn();
const mockApiRequestBinary = jest.fn();
jest.mock('./client', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  apiRequestBinary: (...args: unknown[]) => mockApiRequestBinary(...args),
}));

beforeEach(() => {
  mockApiRequest.mockReset().mockResolvedValue({ success: true });
  mockApiRequestBinary.mockReset().mockResolvedValue({ data: new ArrayBuffer(0), contentType: null, contentDisposition: null });
});

const FILE: RNFile = { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };

describe('reportsApi — simple JSON routes', () => {
  it('getDashboardSummary calls GET /reports/dashboard-summary', async () => {
    await reportsApi.getDashboardSummary();
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/dashboard-summary');
  });

  it('list passes params through as the query string', async () => {
    await reportsApi.list({ page: 2, status: 'draft' });
    expect(mockApiRequest).toHaveBeenCalledWith('/reports', { params: { page: 2, status: 'draft' } });
  });

  it('get fetches a single report by id', async () => {
    await reportsApi.get('r1');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1');
  });

  it('update PUTs only content/additionalNotes/clientId', async () => {
    await reportsApi.update('r1', { content: 'edited' });
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1', { method: 'PUT', body: { content: 'edited' } });
  });

  it('getAnalysisStatus / retryAnalysis hit the right sub-routes', async () => {
    await reportsApi.getAnalysisStatus('r1');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/analysis-status');
    await reportsApi.retryAnalysis('r1');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/analysis/retry', { method: 'POST' });
  });

  it('approve sends the signature + confirmReview:true', async () => {
    const signature = { name: 'Jane', licenseNumber: 'L1', licenseState: 'CA', company: 'Acme' };
    await reportsApi.approve('r1', signature, 'final content');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/approve', {
      method: 'POST',
      body: { signature, confirmReview: true, content: 'final content' },
    });
  });

  it('submitReviewResponse sends decision + notes', async () => {
    await reportsApi.submitReviewResponse('r1', 'changes_requested', 'please fix X');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/review-response', {
      method: 'POST',
      body: { decision: 'changes_requested', notes: 'please fix X' },
    });
  });

  it('exportReport defaults are passed through as the request body', async () => {
    await reportsApi.exportReport('r1', { format: 'pdf' });
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/export', { method: 'POST', body: { format: 'pdf' } });
  });
});

describe('reportsApi — comments/versions/photos', () => {
  it('getComments / addComment / resolveComment / reopenComment', async () => {
    await reportsApi.getComments('r1');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/comments');

    await reportsApi.addComment('r1', 'looks good', { parentId: 'c1' });
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/comments', {
      method: 'POST',
      body: { body: 'looks good', parentId: 'c1' },
    });

    await reportsApi.resolveComment('r1', 'c1');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/comments/c1/resolve', { method: 'POST', idempotent: true });

    await reportsApi.reopenComment('r1', 'c1');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/comments/c1/reopen', { method: 'POST', idempotent: true });
  });

  it('getVersions fetches the version history', async () => {
    await reportsApi.getVersions('r1');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/versions');
  });

  it('getPhotos lists a report photo gallery', async () => {
    await reportsApi.getPhotos('r1');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/photos');
  });

  it('reviewPhoto PUTs the action plus extra fields', async () => {
    await reportsApi.reviewPhoto('r1', 'p1', 'exclude');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/photos/p1/review', {
      method: 'PUT',
      body: { action: 'exclude' },
    });

    await reportsApi.reviewPhoto('r1', 'p1', 'note', { note: 'blurry' });
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/r1/photos/p1/review', {
      method: 'PUT',
      body: { action: 'note', note: 'blurry' },
    });
  });
});

describe('reportsApi — templates', () => {
  it('listTemplates / saveTemplate / deleteTemplate', async () => {
    await reportsApi.listTemplates();
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/templates');

    await reportsApi.saveTemplate('My template', { lossType: 'Fire' });
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/templates', {
      method: 'POST',
      body: { name: 'My template', fields: { lossType: 'Fire' } },
    });

    await reportsApi.deleteTemplate('t1');
    expect(mockApiRequest).toHaveBeenCalledWith('/reports/templates/t1', { method: 'DELETE', idempotent: true });
  });
});

describe('reportsApi — multipart uploads', () => {
  it('generate builds multipart form fields + image/document parts and is NOT idempotent', async () => {
    await reportsApi.generate(
      {
        claimNumber: 'C1',
        insuredName: 'Jane Doe',
        insuredEmail: 'jane@example.com',
        propertyAddress: '1 Main St',
        lossDate: '2026-01-01',
        lossType: 'Fire',
        draftId: 'draft-1',
      },
      [FILE],
      []
    );

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    const [path, options] = mockApiRequest.mock.calls[0];
    expect(path).toBe('/reports/generate');
    expect(options.method).toBe('POST');
    expect(options.idempotent).toBeUndefined();
    expect(options.multipart).toBeInstanceOf(FormData);

    const form = options.multipart as FormData;
    expect(form.get('claimNumber')).toBe('C1');
    expect(form.get('draftId')).toBe('draft-1');
    expect(form.getAll('images').length).toBe(1);
  });

  it('generate omits undefined optional fields from the form entirely', async () => {
    await reportsApi.generate({
      claimNumber: 'C1',
      insuredName: 'Jane Doe',
      insuredEmail: 'jane@example.com',
      propertyAddress: '1 Main St',
      lossDate: '2026-01-01',
      lossType: 'Fire',
    });
    const [, options] = mockApiRequest.mock.calls[0];
    const form = options.multipart as FormData;
    expect(form.has('draftId')).toBe(false);
    expect(form.has('templateId')).toBe(false);
  });

  it('stagePhoto sends draftId + the image and is marked idempotent (content-hash dedup)', async () => {
    await reportsApi.stagePhoto('draft-1', FILE);
    const [path, options] = mockApiRequest.mock.calls[0];
    expect(path).toBe('/reports/photos/stage');
    expect(options.method).toBe('POST');
    expect(options.idempotent).toBe(true);
    const form = options.multipart as FormData;
    expect(form.get('draftId')).toBe('draft-1');
    expect(form.getAll('image').length).toBe(1);
  });
});

describe('reportsApi — binary downloads', () => {
  it('getStagedPhotoImage requests the thumbnail variant via apiRequestBinary', async () => {
    await reportsApi.getStagedPhotoImage('draft-1', 'p1', 'thumbnail');
    expect(mockApiRequestBinary).toHaveBeenCalledWith('/reports/photos/stage/draft-1/p1/image', {
      params: { variant: 'thumbnail' },
    });
  });

  it('getPhotoImage omits the params entirely when no variant is requested', async () => {
    await reportsApi.getPhotoImage('r1', 'p1');
    expect(mockApiRequestBinary).toHaveBeenCalledWith('/reports/r1/photos/p1/image', { params: undefined });
  });

  it('downloadExport passes the filename and optional inline flag as query params', async () => {
    await reportsApi.downloadExport('r1', 'report.pdf', true);
    expect(mockApiRequestBinary).toHaveBeenCalledWith('/reports/r1/download', {
      params: { file: 'report.pdf', inline: true },
    });
  });

  it('downloadDocument passes the filename as a query param', async () => {
    await reportsApi.downloadDocument('r1', 'estimate.pdf');
    expect(mockApiRequestBinary).toHaveBeenCalledWith('/reports/r1/documents/download', {
      params: { file: 'estimate.pdf' },
    });
  });
});

describe('reportsApi — out-of-scope endpoints stay unimplemented', () => {
  it('does not expose sharing/archive/reorder/annotations/regenerate methods', () => {
    const api = reportsApi as unknown as Record<string, unknown>;
    expect(api.shareReport).toBeUndefined();
    expect(api.archiveReport).toBeUndefined();
    expect(api.deleteReport).toBeUndefined();
    expect(api.reorderPhotos).toBeUndefined();
    expect(api.updatePhotoAnnotations).toBeUndefined();
    expect(api.regeneratePhotos).toBeUndefined();
  });
});
