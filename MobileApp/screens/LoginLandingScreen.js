import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
  Platform,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import BackgroundAnimatedGradient from '../components/BackgroundAnimatedGradient';
import GlowButton from '../components/GlowButton';

const { width, height } = Dimensions.get('window');

const LoginLandingScreen = ({ navigation }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Main content animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Animated gradient background with single orange bubble */}
        <BackgroundAnimatedGradient />

        {/* Scrollable content */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          {/* Main content */}
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Headline */}
            <View style={styles.headlineContainer}>
              <Text style={styles.headline}>Easy for Beginners,</Text>
              <Text style={styles.headline}>Powerful for All</Text>
            </View>

            {/* Subtitle */}
            <View style={styles.subtitleContainer}>
              <Text style={styles.subtitle}>
                Effortless Investing for Everyone:{'\n'}
                Discover How Simple Steps{'\n'}
                Can Make Financial Growth Easy
              </Text>
            </View>

            {/* CTA Buttons */}
            <View style={styles.buttonContainer}>
              <GlowButton
                title="LOG IN"
                variant="secondary"
                onPress={() => navigation.navigate('Login')}
                style={styles.button}
              />
              <GlowButton
                title="CREATE ACCOUNT"
                variant="primary"
                onPress={() => navigation.navigate('Signup')}
                style={styles.button}
              />
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: height,
    paddingHorizontal: Math.max(24, width * 0.06),
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 60,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  headlineContainer: {
    marginBottom: 24,
  },
  headline: {
    fontSize: Math.min(48, width * 0.12),
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: Math.min(56, width * 0.14),
    letterSpacing: -1,
  },
  subtitleContainer: {
    marginBottom: 48,
  },
  subtitle: {
    fontSize: Math.min(15, width * 0.04),
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: Math.min(22, width * 0.055),
  },
  buttonContainer: {
    gap: 16,
  },
  button: {
    width: '100%',
  },
});

export default LoginLandingScreen;
