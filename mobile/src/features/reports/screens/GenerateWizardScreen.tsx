import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useReportWizard } from '../wizard/useReportWizard';
import { WizardProgress } from '../wizard/components/WizardProgress';
import { ClaimInfoStep, isClaimInfoStepValid } from '../wizard/steps/ClaimInfoStep';
import { PropertyStep, isPropertyStepValid } from '../wizard/steps/PropertyStep';
import { LossDetailsStep, isLossDetailsStepValid } from '../wizard/steps/LossDetailsStep';
import { PhotosStep } from '../wizard/steps/PhotosStep';
import { ReviewStep } from '../wizard/steps/ReviewStep';
import { LoadingState } from '../components/StateMessage';
import type { WizardStep } from '../wizard/wizardTypes';

const LAST_STEP: WizardStep = 5;

function isStepValid(step: WizardStep, fields: ReturnType<typeof useReportWizard>['state']['fields']): boolean {
  if (step === 1) return isClaimInfoStepValid(fields);
  if (step === 2) return isPropertyStepValid(fields);
  if (step === 3) return isLossDetailsStepValid(fields);
  return true;
}

export function GenerateWizardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const wizard = useReportWizard();
  const [confirmingExit, setConfirmingExit] = useState(false);

  const { state } = wizard;

  if (wizard.resuming) {
    return (
      <ScreenContainer>
        <LoadingState label="Loading your report draft…" />
      </ScreenContainer>
    );
  }

  if (state.submittedReportId) {
    // Guards against ever landing back on a spent draft (e.g. a fast back-navigation race) —
    // the moment a report exists for this draft, route straight to it.
    router.replace({ pathname: '/report/[id]', params: { id: state.submittedReportId } });
    return null;
  }

  const stepValid = isStepValid(state.step, state.fields);

  const handleClose = () => {
    if (state.step === 1 && Object.values(state.fields).every((v) => !v || v === state.fields.claimType)) {
      router.back();
      return;
    }
    setConfirmingExit(true);
  };

  const confirmExit = () => {
    setConfirmingExit(false);
    router.back();
  };

  const goNext = () => {
    if (state.step < LAST_STEP) wizard.goToStep((state.step + 1) as WizardStep);
  };
  const goBack = () => {
    if (state.step > 1) wizard.goToStep((state.step - 1) as WizardStep);
    else handleClose();
  };

  const handleGenerate = async () => {
    await wizard.submit();
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close">
            <ThemedText variant="body" color="primary">
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText variant="title">New report</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <WizardProgress step={state.step} />

        {!!wizard.resumeNotice && (
          <Pressable onPress={wizard.dismissResumeNotice} style={[styles.notice, { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.btn }]}>
            <ThemedText variant="caption" style={{ color: theme.colors.primary }}>
              {wizard.resumeNotice} Tap to dismiss.
            </ThemedText>
          </Pressable>
        )}

        <View style={styles.body}>
          {state.step === 1 && <ClaimInfoStep fields={state.fields} setField={wizard.setField} />}
          {state.step === 2 && <PropertyStep fields={state.fields} setField={wizard.setField} />}
          {state.step === 3 && <LossDetailsStep fields={state.fields} setField={wizard.setField} />}
          {state.step === 4 && (
            <PhotosStep draftId={state.draftId} photos={state.photos} onAdd={wizard.addPhotos} onRemove={wizard.removePhoto} onRetry={wizard.retryPhoto} />
          )}
          {state.step === 5 && <ReviewStep fields={state.fields} readyPhotoCount={wizard.readyPhotoCount} submitError={state.submitError} />}
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

      {confirmingExit && (
        <ExitConfirm onCancel={() => setConfirmingExit(false)} onConfirm={confirmExit} />
      )}
    </ScreenContainer>
  );
}

function ExitConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  // Deferred to a native alert rather than a custom modal — this is a one-off confirmation,
  // not a reusable UI pattern yet. Triggered from an effect, not during render, since
  // Alert.alert is an imperative side effect.
  useEffect(() => {
    Alert.alert('Discard this report?', 'Your progress is saved and you can resume later — leaving now just closes this screen.', [
      { text: 'Keep editing', style: 'cancel', onPress: onCancel },
      { text: 'Leave', style: 'destructive', onPress: onConfirm },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
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
