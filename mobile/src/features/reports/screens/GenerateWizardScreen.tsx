import { useEffect, useRef } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { useReportWizard } from '../wizard/useReportWizard';
import { isPristine } from '../wizard/wizardReducer';
import { WizardProgress } from '../wizard/components/WizardProgress';
import { ClaimInfoStep, isClaimInfoStepValid } from '../wizard/steps/ClaimInfoStep';
import { PropertyStep, isPropertyStepValid } from '../wizard/steps/PropertyStep';
import { LossDetailsStep, isLossDetailsStepValid } from '../wizard/steps/LossDetailsStep';
import { PhotosStep } from '../wizard/steps/PhotosStep';
import { ReviewStep } from '../wizard/steps/ReviewStep';
import { LoadingState, StateMessage } from '../components/StateMessage';
import type { WizardStep } from '../wizard/wizardTypes';
import { WizardTemplates } from '../wizard/components/WizardTemplates';
import { SupportingDocuments } from '../wizard/components/SupportingDocuments';
import { ClaimLinkCard, fieldsFromClaim } from '../wizard/components/ClaimLinkCard';
import { crmApi } from '@/services/api/crm';
import type { ReportTemplate } from '@/services/api/reports';

const LAST_STEP: WizardStep = 5;

function isStepValid(step: WizardStep, fields: ReturnType<typeof useReportWizard>['state']['fields']): boolean {
  if (step === 1) return isClaimInfoStepValid(fields);
  if (step === 2) return isPropertyStepValid(fields);
  if (step === 3) return isLossDetailsStepValid(fields);
  return true;
}

export function GenerateWizardScreen() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  // The `(app)` route guard only renders this screen for an authenticated user, so a missing uid
  // is a transient state (e.g. mid sign-out) — never fall back to an unscoped draft.
  if (!uid) {
    return (
      <ScreenContainer>
        <StateMessage title="Not signed in" description="Sign in again to create a report." />
      </ScreenContainer>
    );
  }
  return <GenerateWizard uid={uid} />;
}

function GenerateWizard({ uid }: { uid: string }) {
  const theme = useTheme();
  const router = useRouter();
  const wizard = useReportWizard(uid);

  const { state } = wizard;
  const { claimId: claimParam } = useLocalSearchParams<{ claimId?: string }>();
  const claimApplied = useRef(false);

  // Opened from a CRM claim ("Generate report for this claim"): link it once the draft has loaded.
  useEffect(() => {
    if (wizard.resuming || claimApplied.current || !claimParam || state.fields.claimId === claimParam) return;
    claimApplied.current = true;
    crmApi
      .claimProfile(String(claimParam))
      .then(({ profile }) => {
        for (const [k, v] of Object.entries(fieldsFromClaim(profile.claim, profile.client))) wizard.setField(k, v);
      })
      .catch(() => undefined);
  }, [wizard, claimParam, state.fields.claimId]);

  // Navigation is a side effect — performed after commit, never during render. The moment a
  // report exists for this draft, route straight to it (replace, so Back never returns to a
  // spent draft).
  useEffect(() => {
    if (state.submittedReportId) {
      router.replace({ pathname: '/report/[id]', params: { id: state.submittedReportId } });
    }
  }, [state.submittedReportId, router]);

  if (wizard.resuming) {
    return (
      <ScreenContainer>
        <LoadingState label="Loading your report draft…" />
      </ScreenContainer>
    );
  }

  if (state.submittedReportId) return null;

  const stepValid = isStepValid(state.step, state.fields);

  const leave = () => router.back();

  const confirmDiscard = () => {
    Alert.alert('Discard this draft?', 'Everything you entered and every photo you added to this draft will be deleted.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Discard draft',
        style: 'destructive',
        onPress: async () => {
          await wizard.discardDraft();
          leave();
        },
      },
    ]);
  };

  const handleClose = () => {
    if (isPristine(state)) {
      leave();
      return;
    }
    Alert.alert('Leave this report?', 'Your draft is saved on this device for your account — you can resume it later, or discard it now.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Save & leave', onPress: leave },
      { text: 'Discard draft', style: 'destructive', onPress: confirmDiscard },
    ]);
  };

  const startOver = () => {
    Alert.alert('Start a new report?', 'This discards the resumed draft, including the photos already added to it.', [
      { text: 'Keep draft', style: 'cancel' },
      { text: 'Start new', style: 'destructive', onPress: () => wizard.startNewReport() },
    ]);
  };

  const goNext = () => {
    if (state.step < LAST_STEP) wizard.goToStep((state.step + 1) as WizardStep);
  };
  const goBack = () => {
    if (state.step > 1) wizard.goToStep((state.step - 1) as WizardStep);
    else handleClose();
  };

  const applyTemplate = (t: ReportTemplate) => {
    for (const [key, value] of Object.entries(t.fields ?? {})) {
      if (typeof value === 'string') wizard.setField(key, value);
    }
  };

  const handleGenerate = async () => {
    await wizard.submit();
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close" disabled={wizard.discarding}>
            <ThemedText variant="body" color="primary">
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText variant="title" accessibilityRole="header">
            Generate Report
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <WizardProgress step={state.step} />

        {!!wizard.resumeNotice && (
          <View style={[styles.notice, { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.btn }]}>
            <ThemedText variant="caption" style={{ color: theme.colors.primary }}>
              {wizard.resumeNotice}
            </ThemedText>
            <View style={styles.noticeActions}>
              <Pressable onPress={startOver} accessibilityRole="button" disabled={wizard.discarding}>
                <ThemedText variant="caption" style={{ color: theme.colors.primary }}>
                  Start a new report instead
                </ThemedText>
              </Pressable>
              <Pressable onPress={wizard.dismissResumeNotice} accessibilityRole="button">
                <ThemedText variant="caption" color="muted">
                  Dismiss
                </ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.body}>
          {state.step === 1 && (
            <ClaimInfoStep
              fields={state.fields}
              setField={wizard.setField}
              header={
                <>
                  <ClaimLinkCard fields={state.fields} setField={wizard.setField} />
                  <WizardTemplates fields={state.fields} onApply={applyTemplate} />
                </>
              }
            />
          )}
          {state.step === 2 && <PropertyStep fields={state.fields} setField={wizard.setField} />}
          {state.step === 3 && <LossDetailsStep fields={state.fields} setField={wizard.setField} />}
          {state.step === 4 && (
            <PhotosStep
              draftId={state.draftId}
              photos={state.photos}
              capacity={wizard.capacity}
              readyCount={wizard.readyPhotoCount}
              onAdd={wizard.addPhotos}
              onRemove={wizard.removePhoto}
              onRetry={wizard.retryPhoto}
              footer={
                <SupportingDocuments documents={state.documents} onAdd={wizard.addDocument} onRemove={wizard.removeDocument} />
              }
            />
          )}
          {state.step === 5 && (
            <ReviewStep
              fields={state.fields}
              readyPhotoCount={wizard.readyPhotoCount}
              uploadingCount={wizard.uploadingCount}
              notReadyCount={state.photos.length - wizard.readyPhotoCount - wizard.uploadingCount}
              submitError={state.submitError}
              documentCount={state.documents.length}
            />
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.footerBtn}>
            <PrimaryButton label="Back" onPress={goBack} variant="secondary" />
          </View>
          <View style={styles.footerBtn}>
            {state.step === LAST_STEP ? (
              <PrimaryButton
                label="Generate report"
                onPress={handleGenerate}
                loading={state.submitting}
                disabled={!wizard.canSubmit}
              />
            ) : (
              <PrimaryButton label="Next" onPress={goNext} disabled={!stepValid} />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerSpacer: {
    width: 50,
  },
  notice: {
    padding: 10,
    marginBottom: 12,
  },
  noticeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  body: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
  },
  footerBtn: {
    flex: 1,
  },
});
