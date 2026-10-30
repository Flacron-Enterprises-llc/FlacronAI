import { useState } from 'react';

import { apiErrorMessage } from '@/hooks/useApiResource';
import { documentsApi } from '@/services/api/documents';
import type { Report } from '@/services/api/reports';
import { todayIso } from './documentCalcs';
import { DocSheet, Disclaimer, Field } from './formKit';

/** Web Mold Supplement modal: creates a separate linked draft (Super Intelligence, from the parent's reviewed photos). */
export function MoldSupplementSheet({ report, onClose, onCreated }: { report: Report; onClose: () => void; onCreated: (r: Report) => void }) {
  const [claim, setClaim] = useState(report.claimNumber ?? '');
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Enter the date of discovery as YYYY-MM-DD.');
    if (date > todayIso()) return setError("Date of discovery cannot be later than today's report date.");
    setBusy(true);
    setError(null);
    try {
      const res = await documentsApi.createMoldSupplement(report.id, { dateOfDiscovery: date, relatedClaimId: claim.trim() || undefined });
      onCreated(res.report);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create the Mold Supplement.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DocSheet title="Mold Supplement" subtitle={`Claim ${report.claimNumber}`} error={error} busy={busy} primaryLabel="Create Mold Supplement" onPrimary={create} onClose={onClose}>
      <Disclaimer text="Creates a new, separate draft report linked to this claim, reusing its insured, property, and reviewed photo data. It is a preliminary visual observation drafted by Super Intelligence only — not a certified mold assessment." />
      <Field label="Related claim number" value={claim} onChangeText={setClaim} maxLength={60} />
      <Field label="Date of discovery *" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" maxLength={10} />
    </DocSheet>
  );
}
