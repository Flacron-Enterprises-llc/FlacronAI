import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
  StatusBar,
  Dimensions,
  Alert,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AIAssistantBubble } from '../components/AIAssistant';
import AnimatedBlobBackground from '../components/AnimatedBlobBackground';
import { authService } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  primary: '#FF7C08',
  primaryDark: '#ff9533',
  background: '#FFFFFF',
  text: '#1f2937',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  success: '#10b981',
  error: '#ef4444',
};

const normalize = (size) => {
  const scale = SCREEN_WIDTH / 375;
  return Math.round(size * scale);
};

export default function ProfileScreen({ userEmail, userName, onLogout, onShowAIAssistant, navigation }) {
  const [notifications, setNotifications] = useState({
    reportGenerated: true,
    usageAlerts: true,
    generalUpdates: false,
    dailyReminders: false,
  });
  const [darkMode, setDarkMode] = useState(false);

  const toggleNotification = async (key) => {
    const newValue = !notifications[key];
    setNotifications(prev => ({ ...prev, [key]: newValue }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Persist to AsyncStorage
    try {
      await AsyncStorage.setItem('notificationSettings', JSON.stringify({ ...notifications, [key]: newValue }));
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await authService.logout();
            onLogout();
          },
        },
      ]
    );
  };

  const MenuItem = ({ icon, title, subtitle, onPress, rightElement, iconColor, iconBg }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconBg || '#f9fafb' }]}>
        <Ionicons name={icon} size={22} color={iconColor || COLORS.primary} />
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>{title}</Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      {rightElement || <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <AnimatedBlobBackground />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <LinearGradient
            colors={['#FF7C08', '#ff9533']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarGradient}
          >
            <Text style={styles.avatarText}>
              {(userName || userEmail)?.[0]?.toUpperCase() || 'U'}
            </Text>
          </LinearGradient>
          <Text style={styles.profileName}>{userName || userEmail?.split('@')[0] || 'User'}</Text>
          <Text style={styles.profileEmail}>{userEmail}</Text>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.menuCard}>
            <MenuItem
              icon="lock-closed-outline"
              title="Change Password"
              subtitle="Update your password"
              iconColor="#3b82f6"
              iconBg="#eff6ff"
              onPress={() => navigation.navigate('ForgotPassword')}
            />
          </View>
        </View>

        {/* Notification Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Settings</Text>
          <View style={styles.menuCard}>
            <View style={styles.notificationItem}>
              <View style={styles.notificationInfo}>
                <Text style={styles.notificationTitle}>Report Generated</Text>
                <Text style={styles.notificationSubtitle}>Get notified when your report is ready</Text>
              </View>
              <Switch
                value={notifications.reportGenerated}
                onValueChange={() => toggleNotification('reportGenerated')}
                trackColor={{ false: '#e5e7eb', true: COLORS.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#e5e7eb"
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.notificationItem}>
              <View style={styles.notificationInfo}>
                <Text style={styles.notificationTitle}>Usage Alerts</Text>
                <Text style={styles.notificationSubtitle}>Alerts when approaching your limit</Text>
              </View>
              <Switch
                value={notifications.usageAlerts}
                onValueChange={() => toggleNotification('usageAlerts')}
                trackColor={{ false: '#e5e7eb', true: COLORS.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#e5e7eb"
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.notificationItem}>
              <View style={styles.notificationInfo}>
                <Text style={styles.notificationTitle}>General Updates</Text>
                <Text style={styles.notificationSubtitle}>News and feature updates</Text>
              </View>
              <Switch
                value={notifications.generalUpdates}
                onValueChange={() => toggleNotification('generalUpdates')}
                trackColor={{ false: '#e5e7eb', true: COLORS.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#e5e7eb"
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.notificationItem}>
              <View style={styles.notificationInfo}>
                <Text style={styles.notificationTitle}>Daily Reminders</Text>
                <Text style={styles.notificationSubtitle}>Daily productivity reminders</Text>
              </View>
              <Switch
                value={notifications.dailyReminders}
                onValueChange={() => toggleNotification('dailyReminders')}
                trackColor={{ false: '#e5e7eb', true: COLORS.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#e5e7eb"
              />
            </View>
          </View>
        </View>

        {/* Help Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Help & Support</Text>
          <View style={styles.menuCard}>
            <MenuItem
              icon="help-circle-outline"
              title="Help & Support"
              iconColor="#8b5cf6"
              iconBg="#f5f3ff"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL('https://flacronenterprises.com');
              }}
            />
            <MenuItem
              icon="document-text-outline"
              title="Terms & Privacy"
              iconColor="#ec4899"
              iconBg="#fdf2f8"
              onPress={() => Alert.alert('Coming Soon', 'Legal documents coming soon!')}
            />
            <MenuItem
              icon="information-circle-outline"
              title="About"
              subtitle="Version 1.0.0"
              iconColor="#06b6d4"
              iconBg="#ecfeff"
              onPress={() => Alert.alert('FlacronAI', 'AI-powered Insurance Report Generator\nVersion 1.0.0')}
            />
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoutGradient}
          >
            <Ionicons name="log-out-outline" size={22} color="#FFFFFF" />
            <Text style={styles.logoutText}>Logout</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      <AIAssistantBubble onPress={onShowAIAssistant} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 16,
    paddingHorizontal: 20,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF7C08',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  avatarText: {
    fontSize: normalize(40),
    fontWeight: '800',
    color: '#FFFFFF',
  },
  profileName: {
    fontSize: normalize(24),
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 16,
  },
  profileEmail: {
    fontSize: normalize(14),
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: normalize(18),
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: normalize(15),
    fontWeight: '600',
    color: COLORS.text,
  },
  menuSubtitle: {
    fontSize: normalize(13),
    color: COLORS.textMuted,
    marginTop: 2,
  },
  logoutButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: normalize(16),
    fontWeight: '700',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  notificationInfo: {
    flex: 1,
    marginRight: 16,
  },
  notificationTitle: {
    fontSize: normalize(15),
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  notificationSubtitle: {
    fontSize: normalize(13),
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },
});
