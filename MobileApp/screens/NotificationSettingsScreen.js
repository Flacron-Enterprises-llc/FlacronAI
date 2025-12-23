import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ModernCard from '../components/ModernCard';
import {
  getNotificationSettings,
  updateNotificationSettings,
  requestNotificationPermission,
  sendLocalNotification,
} from '../services/notificationService';

const COLORS = {
  primary: '#FF6B35',
  primaryLight: '#FF8A50',
  white: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#6A6A6A',
  textMuted: '#9CA3AF',
  border: 'rgba(0, 0, 0, 0.06)',
  background: '#F9FAFB',
  success: '#10b981',
};

export default function NotificationSettingsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    enabled: true,
    sound: true,
    vibration: true,
    badge: true,
    reportGenerated: true,
    usageAlerts: true,
    generalUpdates: true,
    dailyReminders: false,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await getNotificationSettings();
      setSettings(savedSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key) => {
    const newSettings = { ...settings, [key]: !settings[key] };

    // If enabling notifications for the first time, request permission
    if (key === 'enabled' && !settings[key]) {
      const hasPermission = await requestNotificationPermission();
      if (!hasPermission) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in your device settings to receive updates.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    setSettings(newSettings);
    await updateNotificationSettings(newSettings);

    // Show confirmation feedback
    if (key === 'enabled') {
      Alert.alert(
        newSettings[key] ? 'Notifications Enabled' : 'Notifications Disabled',
        newSettings[key]
          ? 'You will now receive important updates and alerts.'
          : 'You will no longer receive notifications.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleTestNotification = async () => {
    if (!settings.enabled) {
      Alert.alert(
        'Notifications Disabled',
        'Please enable notifications first to test.',
        [{ text: 'OK' }]
      );
      return;
    }

    await sendLocalNotification(
      '🔔 Test Notification',
      'This is a test notification from FlacronAI!',
      { type: 'general' }
    );

    Alert.alert(
      'Test Sent!',
      'Check your notification center to see the test notification.',
      [{ text: 'OK' }]
    );
  };

  const renderSettingRow = (icon, title, subtitle, value, onToggle, iconColor = COLORS.primary) => (
    <View style={styles.settingRow}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: `${iconColor}15` }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>
        <View style={styles.settingTextContainer}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#E5E7EB', true: COLORS.primaryLight }}
        thumbColor={value ? COLORS.primary : '#F3F4F6'}
        ios_backgroundColor="#E5E7EB"
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Master Toggle */}
        <ModernCard style={styles.card}>
          <View style={styles.masterToggleContainer}>
            <View style={styles.masterToggleLeft}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryLight]}
                style={styles.masterIcon}
              >
                <Ionicons name="notifications" size={28} color={COLORS.white} />
              </LinearGradient>
              <View style={styles.masterTextContainer}>
                <Text style={styles.masterTitle}>Enable Notifications</Text>
                <Text style={styles.masterSubtitle}>
                  {settings.enabled
                    ? 'Notifications are active'
                    : 'Turn on to receive updates'}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={() => handleToggle('enabled')}
              trackColor={{ false: '#E5E7EB', true: COLORS.primaryLight }}
              thumbColor={settings.enabled ? COLORS.primary : '#F3F4F6'}
              ios_backgroundColor="#E5E7EB"
              style={styles.masterSwitch}
            />
          </View>
        </ModernCard>

        {/* Notification Types */}
        <Text style={styles.sectionTitle}>Notification Types</Text>
        <ModernCard style={styles.card}>
          {renderSettingRow(
            'document-text',
            'Report Generated',
            'Get notified when reports are ready',
            settings.reportGenerated && settings.enabled,
            () => handleToggle('reportGenerated'),
            COLORS.success
          )}
          <View style={styles.divider} />
          {renderSettingRow(
            'stats-chart',
            'Usage Alerts',
            'Warnings when approaching limits',
            settings.usageAlerts && settings.enabled,
            () => handleToggle('usageAlerts'),
            '#F59E0B'
          )}
          <View style={styles.divider} />
          {renderSettingRow(
            'information-circle',
            'General Updates',
            'News, tips, and feature announcements',
            settings.generalUpdates && settings.enabled,
            () => handleToggle('generalUpdates'),
            '#3B82F6'
          )}
          <View style={styles.divider} />
          {renderSettingRow(
            'calendar',
            'Daily Reminders',
            'Get reminded to complete inspections',
            settings.dailyReminders && settings.enabled,
            () => handleToggle('dailyReminders'),
            '#8B5CF6'
          )}
        </ModernCard>

        {/* Notification Behavior */}
        <Text style={styles.sectionTitle}>Notification Behavior</Text>
        <ModernCard style={styles.card}>
          {renderSettingRow(
            'volume-high',
            'Sound',
            'Play sound when notifications arrive',
            settings.sound && settings.enabled,
            () => handleToggle('sound')
          )}
          <View style={styles.divider} />
          {renderSettingRow(
            'phone-portrait',
            'Vibration',
            'Vibrate when notifications arrive',
            settings.vibration && settings.enabled,
            () => handleToggle('vibration')
          )}
          <View style={styles.divider} />
          {renderSettingRow(
            'ellipse',
            'Badge',
            'Show notification count on app icon',
            settings.badge && settings.enabled,
            () => handleToggle('badge')
          )}
        </ModernCard>

        {/* Test Notification */}
        <TouchableOpacity style={styles.testButton} onPress={handleTestNotification}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryLight]}
            style={styles.testButtonGradient}
          >
            <Ionicons name="paper-plane" size={20} color={COLORS.white} />
            <Text style={styles.testButtonText}>Send Test Notification</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Info Card */}
        <ModernCard style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={24} color={COLORS.primary} />
            <Text style={styles.infoTitle}>About Notifications</Text>
          </View>
          <Text style={styles.infoText}>
            FlacronAI sends notifications to keep you updated on report generation, usage limits,
            and important updates. You can customize which notifications you receive.
          </Text>
          <Text style={styles.infoText} style={{ marginTop: 12 }}>
            🔒 Your notification preferences are stored locally and never shared with third
            parties.
          </Text>
        </ModernCard>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 12 : 12,
    paddingBottom: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  scrollView: {
    flex: 1,
  },

  // Master Toggle
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  masterToggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  masterToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  masterIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  masterTextContainer: {
    flex: 1,
  },
  masterTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  masterSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  masterSwitch: {
    transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }],
  },

  // Section
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
    letterSpacing: -0.3,
  },

  // Setting Row
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  settingSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },

  // Test Button
  testButton: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 24,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  testButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  testButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  // Info Card
  infoCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: COLORS.background,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    fontWeight: '500',
  },
});
