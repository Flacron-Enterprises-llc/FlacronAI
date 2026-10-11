/**
 * Remembers a report deep link (`flacronai://report/<id>`) that arrived while the user wasn't
 * signed in, so it can be honored once they are.
 *
 * Expo Router's `Stack.Protected` sends a denied route to the anchor route (`app/index.tsx`),
 * which then redirects to `/login`, so the original target is lost. `useCapturePendingDeepLink`
 * (mounted in the root layout) records the report id instead, `app/index.tsx` redirects to it
 * after authentication, and the report screen clears it once opened.
 *
 * In memory only — never persisted, cleared on sign-out — so a link can't carry across app
 * launches or into a different account's later session. The server still decides access: a
 * report the signed-in account can't see returns "not found" as usual.
 */
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';

let pendingReportId: string | null = null;

const REPORT_PATH = /(?:^|\/)report\/([A-Za-z0-9_-]{1,128})\/?(?:[?#].*)?$/;
const REPORT_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The same report-id shape a deep link accepts — also used to vet push-notification payloads
 * before navigating. `new` is the wizard route, never a report. */
export function isValidReportId(value: unknown): value is string {
  return typeof value === 'string' && value !== 'new' && REPORT_ID.test(value);
}

/** Extracts a report id from any URL form the app can be opened with — the custom scheme
 * (`flacronai://report/abc`), an Expo Go/dev-client URL (`exp://host:8081/--/report/abc`), or a
 * path. `report/new` (the wizard) isn't a report link. */
export function parseReportIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let path = url;
  const schemeSplit = url.indexOf('://');
  if (schemeSplit >= 0) {
    path = url.slice(schemeSplit + 3);
    const expoSep = path.indexOf('/--/');
    if (expoSep >= 0) path = path.slice(expoSep + 4);
  }
  const match = REPORT_PATH.exec(path);
  if (!match || match[1] === 'new') return null;
  return match[1];
}

export function rememberPendingReport(reportId: string): void {
  pendingReportId = reportId;
}

export function peekPendingReport(): string | null {
  return pendingReportId;
}

/** Clears the pending link — all of it, or only if it is `reportId`. */
export function clearPendingReport(reportId?: string): void {
  if (reportId === undefined || pendingReportId === reportId) pendingReportId = null;
}

type CaptureStatus = 'loading' | 'authenticated' | string;

/** Pure decision used by the hook — exported for tests. Returns the report id to remember, or
 * null. A URL is evaluated once: an authenticated user's link is opened by the router directly. */
export function reportIdToRemember(url: string | null, status: CaptureStatus, alreadyHandledUrl: string | null): string | null {
  if (!url || status === 'loading' || url === alreadyHandledUrl) return null;
  if (status === 'authenticated') return null;
  return parseReportIdFromUrl(url);
}

export function useCapturePendingDeepLink(status: CaptureStatus): void {
  const url = Linking.useURL();
  const handledUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url || status === 'loading' || url === handledUrl.current) return;
    const id = reportIdToRemember(url, status, handledUrl.current);
    handledUrl.current = url;
    if (id) rememberPendingReport(id);
  }, [url, status]);
}
