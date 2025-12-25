import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AIAssistantPanel } from './components/AIAssistant';
import { authService } from './services/api';

// Import screens
import DashboardScreen from './screens/DashboardScreen';
import GenerateReportScreen from './screens/GenerateReportScreen';
import ReportsScreen from './screens/ReportsScreen';
import ProfileScreen from './screens/ProfileScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  primary: '#FF7C08',
  primaryDark: '#ff9533',
  background: '#FFFFFF',
  text: '#1f2937',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
};

const normalize = (size) => {
  const scale = SCREEN_WIDTH / 375;
  return Math.round(size * scale);
};

export default function MainApp({ navigation }) {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [showAIAssistant, setShowAIAssistant] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await authService.getUserData();
      console.log('📱 Loading user data in App:', userData);
      if (userData.email) setUserEmail(userData.email);
      if (userData.name) {
        console.log('📱 Setting userName to:', userData.name);
        setUserName(userData.name);
      } else {
        console.log('⚠️ No userName found in storage');
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleShowAIAssistant = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowAIAssistant(true);
  };

  const renderContent = () => {
    const commonProps = {
      userEmail,
      userName,
      navigation,
      onShowAIAssistant: handleShowAIAssistant,
      onLogout: handleLogout,
      onTabChange: setCurrentTab,
    };

    switch (currentTab) {
      case 'dashboard':
        return <DashboardScreen {...commonProps} />;
      case 'generate':
        return <GenerateReportScreen {...commonProps} />;
      case 'reports':
        return <ReportsScreen {...commonProps} />;
      case 'profile':
        return <ProfileScreen {...commonProps} />;
      default:
        return <DashboardScreen {...commonProps} />;
    }
  };

  const TabButton = ({ tab, icon, label, activeIcon }) => {
    const isActive = currentTab === tab;

    return (
      <TouchableOpacity
        style={styles.tabButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setCurrentTab(tab);
        }}
        activeOpacity={0.7}
      >
        {isActive ? (
          <LinearGradient
            colors={['#FF7C08', '#ff9533']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.activeTabGradient}
          >
            <Ionicons name={activeIcon || icon} size={26} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={styles.inactiveTab}>
            <Ionicons name={icon} size={26} color={COLORS.textMuted} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Main Content */}
        <View style={styles.content}>
          {renderContent()}
        </View>

        {/* Modern Bottom Tab Bar */}
        <View style={styles.tabBarContainer}>
          <LinearGradient
            colors={['#FFFFFF', '#FFFFFF']}
            style={styles.tabBarGradient}
          >
            <View style={styles.tabBar}>
            <TabButton
              tab="dashboard"
              icon="home-outline"
              activeIcon="home"
              label="Home"
            />
            <TabButton
              tab="generate"
              icon="create-outline"
              activeIcon="create"
              label="Generate"
            />
            <TabButton
              tab="reports"
              icon="folder-outline"
              activeIcon="folder"
              label="Reports"
            />
            <TabButton
              tab="profile"
              icon="person-outline"
              activeIcon="person"
              label="Profile"
            />
          </View>
        </LinearGradient>
      </View>

        {/* AI Assistant Panel */}
        <AIAssistantPanel
          visible={showAIAssistant}
          onClose={() => setShowAIAssistant(false)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  tabBarContainer: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  tabBarGradient: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  activeTabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#FF7C08',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  inactiveTab: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
  },
});
