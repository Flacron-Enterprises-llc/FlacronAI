import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import type { ApprovalSignature, Report } from '@/services/api/reports';
import { ConfirmCheckbox } from '../components/ConfirmCheckbox';
import { useReportApproval } from '../hooks/useReportApproval';

interface ApprovalSheetProps {
  visible: boolean;
  reportId: string;
  onClose: () => void;
  onApproved: (report: Report) => void;
}

/**
 * The human-review legal attestation (Golden Rule #3) — collects the reviewer's identity and
 * an explicit confirmation before calling `POST /:id/approve`, exactly mirroring what the
 * backend itself requires (`SIGNATURE_INCOMPLETE`/`CONFIRMATION_REQUIRED`, see
 * `useReportApproval.ts`'s header comment). This is not a UI nicety the client invented —
 * every one of these fields is independently required server-side too.
 */
export function ApprovalSheet({ visible, reportId, onClose, onApproved }: ApprovalSheetProps) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { approve, submitting, error, clearError } = useReportApproval(reportId, (report) => {
    onApproved(report);
    onClose();
  });

  const handleApprove = async () => {
    setValidationError(null);
    clearError();
    if (!name.trim() || !licenseNumber.trim() || !licenseState.trim() || !company.trim()) {
      setValidationError('Full name, license number, license state, and company/firm are required.');
      return;
    }
    if (!confirmed) {
      setValidationError('Confirm that you have reviewed this report before approving it.');
      return;
    }
    const signature: ApprovalSignature = { name: name.trim(), licenseNumber: licenseNumber.trim(), licenseState: licenseState.trim(), company: company.trim(), title: title.trim() || undefined };
    await approve(signature);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.background, borderTopLeftRadius: theme.radii.card, borderTopRightRadius: theme.radii.card }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <ThemedText variant="title" style={styles.title}>
              Approve &amp; finalize
            </ThemedText>
            <ThemedText variant="caption" color="muted" style={styles.subtitle}>
              This is your attestation that you have reviewed the AI-generated draft. FlacronAI does not determine coverage, liability,
              cause of loss, or final cost — that remains your professional judgment.
            </ThemedText>

            <FormError message={validationError || error} />

            <AuthTextInput label="Full name *" value={name} onChangeText={setName} />
            <AuthTextInput label="License number *" value={licenseNumber} onChangeText={setLicenseNumber} />
            <AuthTextInput label="License state *" value={licenseState} onChangeText={setLicenseState} autoCapitalize="characters" maxLength={2} />
            <AuthTextInput label="Company / firm *" value={company} onChangeText={setCompany} />
            <AuthTextInput label="Title" value={title} onChangeText={setTitle} />

            <ConfirmCheckbox checked={confirmed} onToggle={() => setConfirmed((v) => !v)} label="I have reviewed this report and confirm it is ready to finalize." />

            <View style={styles.actions}>
              <View style={styles.actionBtn}>
                <PrimaryButton label="Cancel" onPress={onClose} variant="secondary" disabled={submitting} />
              </View>
              <View style={styles.actionBtn}>
                <PrimaryButton label="Approve" onPress={handleApprove} loading={submitting} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    maxHeight: '88%',
    padding: 20,
  },
  title: {
    marginBottom: 6,
  },
  subtitle: {
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  actionBtn: {
    flex: 1,
  },
});
