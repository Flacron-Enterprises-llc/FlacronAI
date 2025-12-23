import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock notifications for Expo Go compatibility
// For production, use a development build with expo-notifications

let Notifications = null;
try {
  Notifications = require('expo-notifications');
  // Configure notification behavior
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications?.AndroidNotificationPriority?.HIGH,
    }),
  });
} catch (error) {
  console.log('📱 Notifications not available in Expo Go. Use development build for full functionality.');
  Notifications = null;
}

// Storage keys
const NOTIFICATION_SETTINGS_KEY = '@notification_settings';

// ===== REQUEST PERMISSION =====
export const requestNotificationPermission = async () => {
  if (!Notifications) {
    console.log('📱 Notifications not available in Expo Go');
    return false;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('📱 Notification permission not granted');
      return false;
    }

    // Get and store push token
    const token = await getPushToken();
    if (token) {
      await AsyncStorage.setItem('pushToken', token);
      console.log('📱 Push Token:', token);
    }

    return true;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

// ===== GET PUSH TOKEN =====
export const getPushToken = async () => {
  if (!Notifications) return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF8A00',
      });
    }

    // For development builds, you can get push token with projectId
    // For Expo Go, skip the projectId or use a valid UUID format
    try {
      const { data: token } = await Notifications.getExpoPushTokenAsync({
        projectId: '00000000-0000-0000-0000-000000000000', // Placeholder UUID for Expo Go testing
      });
      return token;
    } catch (error) {
      console.log('📱 Push token not available in Expo Go (expected behavior)');
      return null;
    }
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
};

// ===== SEND LOCAL NOTIFICATION =====
export const sendLocalNotification = async (title, message, data = {}) => {
  if (!Notifications) {
    console.log('✅ Mock notification:', title, message);
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: message,
        data: data,
        sound: true,
        badge: 1,
        color: '#FF8A00',
        // iOS specific
        subtitle: data.subtitle || '',
        // Android specific
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 250, 250, 250],
      },
      trigger: null, // Send immediately
    });

    console.log('✅ Notification sent:', title);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

// ===== NOTIFICATION TRIGGERS =====

// Trigger when report is generated
export const notifyReportGenerated = async (claimNumber) => {
  await sendLocalNotification(
    '✨ Report Generated Successfully',
    `Your inspection report ${claimNumber} is ready to download.`,
    {
      type: 'report_generated',
      claimNumber,
    }
  );
};

// Trigger daily usage reminder
export const notifyDailyReminder = async (userName) => {
  await sendLocalNotification(
    `👋 Hi ${userName}`,
    'You have pending inspections to complete. Generate reports faster with AI!',
    {
      type: 'daily_reminder',
    }
  );
};

// Trigger subscription limit warning
export const notifyLimitWarning = async (remaining) => {
  await sendLocalNotification(
    '⚠️ Usage Limit Alert',
    `You have ${remaining} reports remaining this month. Upgrade to generate more.`,
    {
      type: 'limit_warning',
      remaining,
    }
  );
};

// Trigger AI assistant suggestion
export const notifyAISuggestion = async (suggestion) => {
  await sendLocalNotification(
    '💡 AI Assistant Tip',
    suggestion,
    {
      type: 'ai_suggestion',
    }
  );
};

// ===== NOTIFICATION LISTENERS =====

// Handle notification received while app is in foreground
export const setupForegroundListener = () => {
  if (!Notifications) return { remove: () => {} };

  return Notifications.addNotificationReceivedListener((notification) => {
    console.log('📬 Notification received (foreground):', notification);
    // You can show in-app notification UI here
  });
};

// Handle notification tapped (app opened from notification)
export const setupResponseListener = () => {
  if (!Notifications) return { remove: () => {} };

  return Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('👆 Notification tapped:', response);
    const data = response.notification.request.content.data;

    // Navigate based on notification type
    switch (data.type) {
      case 'report_generated':
        // Navigate to reports screen
        console.log('Navigate to reports:', data.claimNumber);
        break;
      case 'limit_warning':
        // Navigate to upgrade screen
        console.log('Navigate to upgrade screen');
        break;
      case 'ai_suggestion':
        // Open AI assistant
        console.log('Open AI assistant');
        break;
      default:
        console.log('Unknown notification type');
    }
  });
};

// ===== BADGE MANAGEMENT =====

export const setBadgeCount = async (count) => {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error('Error setting badge count:', error);
  }
};

export const clearBadge = async () => {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch (error) {
    console.error('Error clearing badge:', error);
  }
};

// ===== SCHEDULED NOTIFICATIONS =====

// Schedule notification for future time
export const scheduleNotification = async (title, message, triggerDate, data = {}) => {
  try {
    const trigger = new Date(triggerDate);

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: message,
        data,
        sound: true,
        color: '#FF8A00',
      },
      trigger,
    });

    console.log('📅 Notification scheduled for:', trigger);
  } catch (error) {
    console.error('Error scheduling notification:', error);
  }
};

// Cancel all scheduled notifications
export const cancelAllNotifications = async () => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('🗑️ All scheduled notifications cancelled');
  } catch (error) {
    console.error('Error cancelling notifications:', error);
  }
};

// ===== NOTIFICATION SETTINGS =====

// Get notification settings
export const getNotificationSettings = async () => {
  try {
    const settingsJson = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (settingsJson) {
      return JSON.parse(settingsJson);
    }

    // Default settings
    return {
      enabled: true,
      sound: true,
      vibration: true,
      badge: true,
      reportGenerated: true,
      usageAlerts: true,
      generalUpdates: true,
      dailyReminders: false,
    };
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return {
      enabled: true,
      sound: true,
      vibration: true,
      badge: true,
      reportGenerated: true,
      usageAlerts: true,
      generalUpdates: true,
      dailyReminders: false,
    };
  }
};

// Update notification settings
export const updateNotificationSettings = async (settings) => {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    console.log('✅ Notification settings updated');
    return true;
  } catch (error) {
    console.error('Error updating notification settings:', error);
    return false;
  }
};

// Check if notifications are enabled before sending
const shouldSendNotification = async (type) => {
  const settings = await getNotificationSettings();

  if (!settings.enabled) {
    return false;
  }

  switch (type) {
    case 'report_generated':
      return settings.reportGenerated;
    case 'usage':
      return settings.usageAlerts;
    case 'general':
      return settings.generalUpdates;
    case 'daily_reminder':
      return settings.dailyReminders;
    default:
      return settings.enabled;
  }
};

// Enhanced sendLocalNotification with settings check
export const sendLocalNotificationWithSettings = async (title, message, data = {}) => {
  const canSend = await shouldSendNotification(data.type || 'general');

  if (!canSend) {
    console.log('🔕 Notification disabled by user settings:', data.type);
    return;
  }

  const settings = await getNotificationSettings();

  if (!Notifications) {
    console.log('✅ Mock notification:', title, message);
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: message,
        data: data,
        sound: settings.sound ? true : false,
        badge: settings.badge ? 1 : 0,
        color: '#FF6B35',
        subtitle: data.subtitle || '',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: settings.vibration ? [0, 250, 250, 250] : [0],
      },
      trigger: null,
    });

    console.log('✅ Notification sent:', title);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

export default {
  requestNotificationPermission,
  getPushToken,
  sendLocalNotification,
  sendLocalNotificationWithSettings,
  notifyReportGenerated,
  notifyDailyReminder,
  notifyLimitWarning,
  notifyAISuggestion,
  setupForegroundListener,
  setupResponseListener,
  setBadgeCount,
  clearBadge,
  scheduleNotification,
  cancelAllNotifications,
  getNotificationSettings,
  updateNotificationSettings,
};
