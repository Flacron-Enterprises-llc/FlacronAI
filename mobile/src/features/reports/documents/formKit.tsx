import type { ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { Card, Icon } from '@/components/ui';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import { useTheme } from '@/theme';

/** Full-screen editor sheet: title, close (confirms when dirty), scrolling body, error and a footer action. */
export function DocSheet({
  title,
  subtitle,
  dirty,
  error,
  primaryLabel,
  onPrimary,
  busy,
  primaryDisabled,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  dirty?: boolean;
  error?: string | null;
  primaryLabel?: string;
  onPrimary?: () => void;
  busy?: boolean;
  primaryDisabled?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const close = () => {
    if (!dirty || busy) return onClose();
    Alert.alert('Discard changes?', 'Your unsaved changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.head}>
            <View style={styles.fill}>
              <ThemedText variant="title" numberOfLines={2} accessibilityRole="header">
                {title}
              </ThemedText>
              {subtitle ? (
                <ThemedText variant="caption" color="muted">
                  {subtitle}
                </ThemedText>
              ) : null}
            </View>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.iconBtn}>
              <Icon name="x" size={22} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
            <FormError message={error ?? null} />
            {primaryLabel && onPrimary ? <PrimaryButton label={primaryLabel} onPress={onPrimary} loading={busy} disabled={primaryDisabled} /> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText variant="caption" color="muted" style={styles.fieldLabel}>
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel={label}
        {...props}
        style={[
          styles.input,
          props.multiline && styles.multi,
          { color: theme.colors.ink, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, fontFamily: theme.typography.fontFamily.body },
          props.editable === false && { opacity: 0.6 },
          style,
        ]}
      />
    </View>
  );
}

export const NumField = (props: TextInputProps & { label: string }) => <Field keyboardType="decimal-pad" {...props} />;

export function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.toggle}>
      <ThemedText variant="body" style={styles.fill}>
        {label}
      </ThemedText>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
      />
    </View>
  );
}

/** One editable row (line item, payment, coverage limit…) with an optional remove control. */
export function RowCard({ title, onRemove, children }: { title: string; onRemove?: () => void; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Card style={styles.row}>
      <View style={styles.rowHead}>
        <ThemedText variant="body" style={[styles.fill, { fontFamily: theme.typography.fontFamily.bodySemiBold }]}>
          {title}
        </ThemedText>
        {onRemove ? (
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${title}`} hitSlop={8} style={styles.iconBtn}>
            <Icon name="trash-2" color={theme.colors.error} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText variant="caption" color="muted" style={styles.section}>
      {children.toUpperCase()}
    </ThemedText>
  );
}

export function TotalsBox({ rows, note }: { rows: [string, string, boolean?][]; note?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.totals, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      {rows.map(([label, value, strong]) => (
        <View key={label} style={styles.totalRow}>
          <ThemedText variant={strong ? 'subtitle' : 'body'} style={styles.fill}>
            {label}
          </ThemedText>
          <ThemedText variant={strong ? 'subtitle' : 'body'} style={strong ? { fontFamily: theme.typography.fontFamily.display } : undefined}>
            {value}
          </ThemedText>
        </View>
      ))}
      {note ? (
        <ThemedText variant="caption" color="muted" style={styles.note}>
          {note}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function Disclaimer({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.disclaimer, { backgroundColor: theme.colors.warning + '14', borderLeftColor: '#FBBF24' }]}>
      <ThemedText variant="caption">{text}</ThemedText>
    </View>
  );
}

export function TwoCol({ children }: { children: ReactNode }) {
  return <View style={styles.two}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, paddingBottom: 48 },
  field: { marginBottom: 10, flex: 1, minWidth: 130 },
  fieldLabel: { marginBottom: 4, fontFamily: 'Inter_500Medium' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontSize: 15 },
  multi: { minHeight: 80, paddingTop: 10, textAlignVertical: 'top' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  row: { marginBottom: 10 },
  rowHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  section: { letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold', marginTop: 16, marginBottom: 8 },
  totals: { borderWidth: 1, borderRadius: 16, padding: 14, marginVertical: 12, gap: 6 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { marginTop: 4 },
  disclaimer: { borderLeftWidth: 4, borderRadius: 8, padding: 10, marginVertical: 10 },
  two: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
