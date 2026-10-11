import { __resetEndedTagsCache, computeBindingTag, ENDED_TAG_TTL_MS, isEndedTag, rememberEndedTag } from './endedBindingTags';
import { createTapRouter } from './notificationRouting';
import { readPushMeta } from './pushPayload';

// expo-crypto's native digest is replaced by Node's — same SHA-256, so this also checks the
// tag matches backend/utils/pushDeviceStore.js's bindingTag() derivation.
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: (_alg: string, value: string) =>
    Promise.resolve(jest.requireActual('crypto').createHash('sha256').update(value).digest('hex')),
}));
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
  setItem: (k: string, v: string) => {
    mockStore.set(k, v);
    return Promise.resolve();
  },
}));
const mockRemember = jest.fn();
jest.mock('@/features/navigation/pendingDeepLink', () => ({
  rememberPendingReport: (id: string) => mockRemember(id),
  isValidReportId: (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id),
}));

const BIND = 'ABCDEF01-0000-4000-8000-000000000000';
const backendTag = (bindingId: string) => {
  const { createHash } = jest.requireActual('crypto');
  const hash = createHash('sha256').update(bindingId.toLowerCase()).digest('hex');
  return createHash('sha256').update(`${hash}:push-tag`).digest('hex').slice(0, 16);
};

beforeEach(() => {
  mockStore.clear();
  mockRemember.mockClear();
  __resetEndedTagsCache();
});

describe('ended binding tags', () => {
  it('derives the same tag as the backend, never exposing the bindingId', async () => {
    const tag = await computeBindingTag(BIND);
    expect(tag).toBe(backendTag(BIND));
    expect(tag).toMatch(/^[0-9a-f]{16}$/);
  });

  it('remembers ended tags persistently, capped and expiring', async () => {
    const tag = await computeBindingTag(BIND);
    expect(await isEndedTag(tag)).toBe(false);
    await rememberEndedTag(tag, 1000);
    __resetEndedTagsCache(); // simulate app restart
    expect(await isEndedTag(tag, 2000)).toBe(true);
    expect(await isEndedTag(tag, 1000 + ENDED_TAG_TTL_MS + 1)).toBe(false);
    expect(await isEndedTag(null)).toBe(false);
    expect(await isEndedTag('not-a-tag')).toBe(false);
    for (let i = 0; i < 25; i++) await rememberEndedTag(i.toString(16).padStart(16, '0'), 5000);
    expect(JSON.parse(mockStore.get('flac_push_ended_tags_v1')!)).toHaveLength(20);
  });

  it('stored data holds only tags and timestamps', async () => {
    await rememberEndedTag(await computeBindingTag(BIND));
    const raw = mockStore.get('flac_push_ended_tags_v1')!;
    expect(raw).not.toContain(BIND.toLowerCase());
    expect(Object.keys(JSON.parse(raw)[0]).sort()).toEqual(['at', 't']);
  });
});

describe('push meta + tap routing', () => {
  const nav = { openReport: jest.fn(), openDashboard: jest.fn() };
  const data = (o: Record<string, unknown> = {}) => ({ type: 'report_completed', reportId: 'rep1', eventId: 'evt1', bindingTag: 'aaaaaaaaaaaaaaaa', ...o });

  it('reads only well-formed eventId / bindingTag', () => {
    expect(readPushMeta(data())).toEqual({ eventId: 'evt1', bindingTag: 'aaaaaaaaaaaaaaaa' });
    expect(readPushMeta(data({ eventId: 'bad id!', bindingTag: 'XYZ' }))).toEqual({ eventId: null, bindingTag: null });
    expect(readPushMeta(null)).toEqual({ eventId: null, bindingTag: null });
  });

  it('a re-delivered event (new OS notification id, same eventId) navigates once', () => {
    const route = createTapRouter();
    expect(route({ id: 'os-1', data: data() }, 'authenticated', nav)).toBe('navigated');
    expect(route({ id: 'os-2', data: data() }, 'authenticated', nav)).toBe('ignored-duplicate');
    expect(nav.openReport).toHaveBeenCalledTimes(1);
  });

  it('a stale (ended-binding) push never navigates and is never remembered for the next sign-in', () => {
    const route = createTapRouter();
    expect(route({ id: 'os-3', data: data({ eventId: 'evt2' }) }, 'signed-out', nav, { stale: true })).toBe('ignored-stale');
    expect(route({ id: 'os-4', data: data({ eventId: 'evt3' }) }, 'authenticated', nav, { stale: true })).toBe('ignored-stale');
    expect(mockRemember).not.toHaveBeenCalled();
  });

  it('legacy pushes without metadata still route as before', () => {
    const route = createTapRouter();
    expect(route({ id: 'os-5', data: { type: 'report_completed', reportId: 'rep9' } }, 'signed-out', nav)).toBe('deferred-until-sign-in');
    expect(mockRemember).toHaveBeenCalledWith('rep9');
  });
});
