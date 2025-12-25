import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Dimensions,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { AIAssistantBubble } from '../components/AIAssistant';
import { userService, reportService } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  orange: '#FF7C08',
  orangeLight: '#ff9533',
  white: '#FFFFFF',
  backgroundGray: '#F5F5F5',
  textDark: '#2D2D2D',
  textGray: '#7A7A7A',
  textLight: '#A0A0A0',
  cardBorder: '#EEEEEE',
  iconBgPeach: '#FFE8D6',
  iconBgMint: '#D4F4E8',
  iconBgYellow: '#FFF4D6',
};

export default function DashboardScreen({ userEmail, userName, onShowAIAssistant, onTabChange }) {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    usedThisMonth: 0,
    monthlyLimit: 1,
    totalReports: 0,
  });
  const [tierName, setTierName] = useState('Starter');
  const [recentReports, setRecentReports] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsData, reportsData] = await Promise.all([
        userService.getStats(),
        reportService.getMyReports(),
      ]);

      console.log('📊 Dashboard - Stats data:', statsData);

      if (statsData.success && statsData.stats) {
        // Use limit directly from backend (matches web app exactly)
        const monthlyLimit = typeof statsData.stats.limit === 'number'
          ? statsData.stats.limit
          : (statsData.stats.limit === 'Unlimited' ? 999 : 1);

        setStats({
          usedThisMonth: statsData.stats.reportsGenerated || 0,
          monthlyLimit: monthlyLimit,
          totalReports: statsData.stats.totalReports || 0,
        });

        // Set tier name for display (matches web app)
        setTierName(statsData.stats.tierName || 'Starter');

        console.log('📊 Dashboard - Final stats:', {
          usedThisMonth: statsData.stats.reportsGenerated || 0,
          monthlyLimit: monthlyLimit,
          totalReports: statsData.stats.totalReports || 0,
          tier: statsData.stats.tier,
          tierName: statsData.stats.tierName,
        });
      }

      if (reportsData.success && reportsData.reports) {
        setRecentReports(reportsData.reports.slice(0, 3));
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.logo}>FlacronAI</Text>
          <TouchableOpacity style={styles.chatButton}>
            <Ionicons name="chatbubble-ellipses" size={24} color={COLORS.textDark} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.orange}
            colors={[COLORS.orange]}
          />
        }
      >
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <View>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.userName}>{userName || 'Tesr'}</Text>
          </View>
          <TouchableOpacity>
            <Ionicons name="notifications-outline" size={28} color={COLORS.textDark} />
          </TouchableOpacity>
        </View>

        {/* Usage Overview Card */}
        <View style={styles.usageCard}>
          <View style={styles.usageHeader}>
            <Text style={styles.usageTitle}>Usage Overview</Text>
            <View style={styles.starterBadge}>
              <Ionicons name="trophy" size={14} color={COLORS.white} />
              <Text style={styles.starterText}>{tierName}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            {/* Used this month */}
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.iconBgPeach }]}>
                <Ionicons name="document-text" size={28} color={COLORS.orange} />
              </View>
              <Text style={styles.statNumber}>{stats.usedThisMonth}</Text>
              <Text style={styles.statLabel}>Used this month</Text>
            </View>

            {/* Vertical Divider */}
            <View style={styles.statDivider} />

            {/* Monthly limit */}
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.iconBgMint }]}>
                <Ionicons name="checkmark-circle" size={28} color="#10B981" />
              </View>
              <Text style={styles.statNumber}>{stats.monthlyLimit}</Text>
              <Text style={styles.statLabel}>Monthly limit</Text>
            </View>

            {/* Vertical Divider */}
            <View style={styles.statDivider} />

            {/* Total reports */}
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.iconBgYellow }]}>
                <Ionicons name="calendar" size={28} color="#F59E0B" />
              </View>
              <Text style={styles.statNumber}>{stats.totalReports}</Text>
              <Text style={styles.statLabel}>Total reports</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            {/* Generate Report Card */}
            <TouchableOpacity
              style={[styles.actionCard, { marginRight: 12 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onTabChange?.('generate');
              }}
              activeOpacity={0.9}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="add-circle" size={40} color={COLORS.white} />
              </View>
              <Text style={styles.actionTitle}>Generate Report</Text>
              <Text style={styles.actionSubtitle}>Create new inspection</Text>
            </TouchableOpacity>

            {/* My Reports Card */}
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onTabChange?.('reports');
              }}
              activeOpacity={0.9}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="folder-open" size={40} color={COLORS.white} />
              </View>
              <Text style={styles.actionTitle}>My Reports</Text>
              <Text style={styles.actionSubtitle}>View all reports</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Reports */}
        {recentReports.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Recent Reports</Text>
            {recentReports.map((report, index) => (
              <TouchableOpacity
                key={report.reportId || index}
                style={styles.recentReportCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onTabChange?.('reports');
                }}
              >
                <View style={styles.reportIconCircle}>
                  <Ionicons name="document-text" size={20} color={COLORS.orange} />
                </View>
                <View style={styles.reportDetails}>
                  <Text style={styles.reportClaimNumber}>{report.claimNumber}</Text>
                  <Text style={styles.reportInsuredName}>{report.insuredName}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* AI Assistant Floating Button */}
      <AIAssistantBubble onPress={onShowAIAssistant} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundGray,
  },
  header: {
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 16 : 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  logo: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.orange,
  },
  chatButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  welcomeSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 16,
    color: COLORS.textGray,
    fontWeight: '400',
  },
  userName: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textDark,
    marginTop: 4,
  },
  usageCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  usageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  starterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.orange,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  starterText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.textGray,
    textAlign: 'center',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 60,
    backgroundColor: COLORS.cardBorder,
    marginHorizontal: 8,
  },
  quickActionsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 12,
  },
  quickActionsGrid: {
    flexDirection: 'row',
  },
  actionCard: {
    flex: 1,
    backgroundColor: COLORS.orange,
    borderRadius: 20,
    padding: 20,
    minHeight: 140,
    justifyContent: 'center',
    shadowColor: COLORS.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  actionIcon: {
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  recentSection: {
    marginBottom: 24,
  },
  recentReportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  reportIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.iconBgPeach,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  reportDetails: {
    flex: 1,
  },
  reportClaimNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 2,
  },
  reportInsuredName: {
    fontSize: 13,
    color: COLORS.textGray,
  },
});
