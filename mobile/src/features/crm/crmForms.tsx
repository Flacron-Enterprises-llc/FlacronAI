import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { DocSheet, Field, TwoCol } from '@/features/reports/documents/formKit';
import { LOSS_TYPES } from '@/features/reports/wizard/constants';
import { CLAIM_STATUSES, crmApi, type CrmAppointment, type CrmClaim, type CrmClient } from '@/services/api/crm';
import { ApiRequestError } from '@/types/api';
import { useTheme } from '@/theme';

/** CRM validation errors arrive as an express-validator map; show the first field message. */
export function crmError(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) {
    const first = err.fieldErrors ? Object.values(err.fieldErrors)[0]?.msg : null;
    return first || err.message || fallback;
  }
  return fallback;
}

function Choice({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.choice}>
      <ThemedText variant="caption" color="muted" style={styles.label}>
        {label}
      </ThemedText>
      <View style={styles.chips}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(on ? '' : o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.chip, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primarySoft : theme.colors.background }]}>
              <ThemedText variant="caption">{o.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ClientPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const clients = useApiResource(() => crmApi.clients({ limit: 100 }).then((r) => r.data));
  return <Choice label="Client" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} value={value} onChange={onChange} />;
}

function confirmDelete(label: string, fn: () => Promise<unknown>, after: () => void, setError: (e: string) => void) {
  return () =>
    Alert.alert(`Delete this ${label}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fn();
            after();
          } catch (err) {
            setError(crmError(err, `Could not delete the ${label}.`));
          }
        },
      },
    ]);
}

export function ClientSheet({ client, onClose, onSaved }: { client?: CrmClient | null; onClose: () => void; onSaved: (c?: CrmClient) => void }) {
  const [f, setF] = useState({ name: client?.name ?? '', email: client?.email ?? '', phone: client?.phone ?? '', company: client?.company ?? '', address: client?.address ?? '', notes: client?.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => k === 'name' || v)) as Partial<CrmClient>;
    try {
      const res = client ? await crmApi.updateClient(client.id, body) : await crmApi.createClient(body);
      onSaved(res.client);
      onClose();
    } catch (err) {
      setError(crmError(err, 'Could not save the client.'));
    } finally {
      setBusy(false);
    }
  };
  const del = confirmDelete('client', () => crmApi.deleteClient(client!.id), () => { onSaved(); onClose(); }, setError);
  return (
    <DocSheet title={client ? 'Edit Client' : 'New Client'} error={error} busy={busy} primaryLabel="Save Client" primaryDisabled={!f.name.trim()} onPrimary={save} onClose={onClose}>
      <Field label="Name *" value={f.name} onChangeText={set('name')} maxLength={200} />
      <TwoCol>
        <Field label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={20} />
      </TwoCol>
      <Field label="Company" value={f.company} onChangeText={set('company')} maxLength={200} />
      <Field label="Address" value={f.address} onChangeText={set('address')} maxLength={300} />
      <Field label="Notes" value={f.notes} onChangeText={set('notes')} maxLength={2000} multiline />
      {client ? (
        <View style={styles.mb}>
          <PrimaryButton variant="danger" icon="trash-2" label="Delete client" onPress={del} />
        </View>
      ) : null}
    </DocSheet>
  );
}

export function ClaimSheet({ claim, defaultClientId, onClose, onSaved }: { claim?: CrmClaim | null; defaultClientId?: string; onClose: () => void; onSaved: (c?: CrmClaim) => void }) {
  const [f, setF] = useState({
    clientId: claim?.clientId ?? defaultClientId ?? '',
    claimNumber: claim?.claimNumber ?? '',
    lossType: claim?.lossType ?? '',
    lossDate: claim?.lossDate ?? '',
    status: (claim?.status ?? 'open').toLowerCase(),
    propertyAddress: claim?.propertyAddress ?? '',
    description: claim?.description ?? '',
    notes: claim?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true);
    setError(null);
    const body: Partial<CrmClaim> = {
      lossType: f.lossType,
      status: f.status || 'open',
      ...(f.clientId ? { clientId: f.clientId } : {}),
      ...(f.claimNumber.trim() ? { claimNumber: f.claimNumber.trim() } : {}),
      ...(f.lossDate.trim() ? { lossDate: f.lossDate.trim() } : {}),
      ...(f.propertyAddress.trim() ? { propertyAddress: f.propertyAddress.trim() } : {}),
      ...(f.description.trim() ? { description: f.description.trim() } : {}),
      ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
    };
    try {
      const res = claim ? await crmApi.updateClaim(claim.id, body) : await crmApi.createClaim(body);
      onSaved(res.claim);
      onClose();
    } catch (err) {
      setError(crmError(err, 'Could not save the claim.'));
    } finally {
      setBusy(false);
    }
  };
  const del = confirmDelete('claim', () => crmApi.deleteClaim(claim!.id), () => { onSaved(); onClose(); }, setError);
  return (
    <DocSheet title={claim ? 'Edit Claim' : 'New Claim'} error={error} busy={busy} primaryLabel="Save Claim" primaryDisabled={!f.lossType} onPrimary={save} onClose={onClose}>
      <ClientPicker value={f.clientId} onChange={set('clientId')} />
      <TwoCol>
        <Field label="Claim number" value={f.claimNumber} onChangeText={(v) => set('claimNumber')(v.replace(/[^A-Za-z0-9-]/g, ''))} maxLength={50} autoCapitalize="characters" placeholder="Auto if empty" />
        <Field label="Loss date" value={f.lossDate} onChangeText={set('lossDate')} placeholder="YYYY-MM-DD" maxLength={10} />
      </TwoCol>
      <Choice label="Loss type *" options={LOSS_TYPES.map((l) => ({ value: l, label: l }))} value={f.lossType} onChange={set('lossType')} />
      <Choice label="Status" options={CLAIM_STATUSES} value={f.status} onChange={set('status')} />
      <Field label="Property address" value={f.propertyAddress} onChangeText={set('propertyAddress')} maxLength={300} />
      <Field label="Description" value={f.description} onChangeText={set('description')} maxLength={5000} multiline />
      <Field label="Notes" value={f.notes} onChangeText={set('notes')} multiline />
      {claim ? (
        <View style={styles.mb}>
          <PrimaryButton
            variant="secondary"
            icon={claim.archived ? 'rotate-ccw' : 'archive'}
            label={claim.archived ? 'Restore claim' : 'Archive claim'}
            onPress={async () => {
              try {
                const res = await crmApi.updateClaim(claim.id, { archived: !claim.archived });
                onSaved(res.claim);
                onClose();
              } catch (err) {
                setError(crmError(err, 'Could not update the claim.'));
              }
            }}
          />
          <View style={styles.mt}>
            <PrimaryButton variant="danger" icon="trash-2" label="Delete claim" onPress={del} />
          </View>
        </View>
      ) : null}
    </DocSheet>
  );
}

const APPT_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function AppointmentSheet({ appointment, onClose, onSaved }: { appointment?: CrmAppointment | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: appointment?.title ?? '',
    date: appointment?.date ?? '',
    time: appointment?.time ?? '',
    location: appointment?.location ?? '',
    notes: appointment?.notes ?? '',
    status: appointment?.status ?? 'scheduled',
    clientId: appointment?.clientId ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v).trim()]).filter(([k, v]) => k === 'title' || k === 'date' || v)) as Partial<CrmAppointment>;
    try {
      if (appointment) await crmApi.updateAppointment(appointment.id, body);
      else await crmApi.createAppointment(body);
      onSaved();
      onClose();
    } catch (err) {
      setError(crmError(err, 'Could not save the appointment.'));
    } finally {
      setBusy(false);
    }
  };
  const del = confirmDelete('appointment', () => crmApi.deleteAppointment(appointment!.id), () => { onSaved(); onClose(); }, setError);
  return (
    <DocSheet title={appointment ? 'Edit Appointment' : 'New Appointment'} error={error} busy={busy} primaryLabel="Save Appointment" primaryDisabled={!f.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(f.date)} onPrimary={save} onClose={onClose}>
      <Field label="Title *" value={f.title} onChangeText={set('title')} maxLength={200} />
      <TwoCol>
        <Field label="Date *" value={f.date} onChangeText={set('date')} placeholder="YYYY-MM-DD" maxLength={10} />
        <Field label="Time" value={f.time} onChangeText={set('time')} placeholder="HH:MM" maxLength={5} />
      </TwoCol>
      <Field label="Location" value={f.location} onChangeText={set('location')} maxLength={300} />
      <Choice label="Status" options={APPT_STATUSES} value={f.status} onChange={(v) => set('status')(v || 'scheduled')} />
      <ClientPicker value={f.clientId} onChange={set('clientId')} />
      <Field label="Notes" value={f.notes} onChangeText={set('notes')} multiline />
      {appointment ? (
        <View style={styles.mb}>
          <PrimaryButton variant="danger" icon="trash-2" label="Delete appointment" onPress={del} />
        </View>
      ) : null}
    </DocSheet>
  );
}

const styles = StyleSheet.create({
  choice: { marginBottom: 10 },
  label: { marginBottom: 4, fontFamily: 'Inter_500Medium' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  mb: { marginBottom: 12 },
  mt: { marginTop: 10 },
});
