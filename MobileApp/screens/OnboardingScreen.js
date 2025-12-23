import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const OnboardingScreen = ({ navigation }) => {
  const orangeWaveX = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Orange wave sliding left to right continuously
    Animated.loop(
      Animated.sequence([
        Animated.timing(orangeWaveX, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(orangeWaveX, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const orangeTranslateX = orangeWaveX.interpolate({
    inputRange: [0, 1],
    outputRange: [-50, 50],
  });

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        {/* Wave Background at Top */}
        <View style={styles.waveContainer}>
          {/* Black Wave - Static (larger, bottom) */}
          <Svg
            height={height * 0.35}
            width={width}
            viewBox={`0 0 ${width} ${height * 0.35}`}
            style={styles.blackWave}
          >
            <Path
              d={`M 0 ${height * 0.05} Q ${width * 0.25} ${height * 0.15} ${width * 0.5} ${height * 0.12} T ${width} ${height * 0.08} L ${width} 0 L 0 0 Z`}
              fill="#1a1a1a"
            />
          </Svg>

          {/* Orange Wave - Animated (smaller, on top, moving left-right) */}
          <Animated.View
            style={[
              styles.orangeWaveContainer,
              {
                transform: [{ translateX: orangeTranslateX }],
              },
            ]}
          >
            <Svg
              height={height * 0.25}
              width={width * 1.2}
              viewBox={`0 0 ${width * 1.2} ${height * 0.25}`}
              style={styles.orangeWave}
            >
              <Path
                d={`M 0 ${height * 0.08} Q ${width * 0.3} ${height * 0.14} ${width * 0.6} ${height * 0.1} T ${width * 1.2} ${height * 0.08} L ${width * 1.2} 0 L 0 0 Z`}
                fill="#FF6B35"
              />
            </Svg>
          </Animated.View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Tagline Section */}
          <View style={styles.taglineSection}>
            <Text style={styles.tagline}>AI-POWERED INSURANCE INSPECTIONS</Text>
            <View style={styles.poweredByContainer}>
              <Text style={styles.poweredByText}>Powered by IBM  •  Distributed by Microsoft</Text>
            </View>
          </View>

          {/* Headline */}
          <View style={styles.textContainer}>
            <Text style={styles.headlineRegular}>Generate</Text>
            <Text style={styles.headlineHighlight}>Professional</Text>
            <Text style={styles.headlineRegular}>Inspection Reports</Text>
            <Text style={styles.headlineRegular}>Instantly</Text>
          </View>

          {/* CTA Button */}
          <Animated.View
            style={[
              styles.buttonWrapper,
              {
                transform: [{ scale: buttonScale }],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.replace('Login')}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              activeOpacity={0.9}
            >
              <Text style={styles.buttonText}>Get Started</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  waveContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height * 0.35,
    overflow: 'hidden',
  },
  blackWave: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  orangeWaveContainer: {
    position: 'absolute',
    top: 0,
    left: -width * 0.1,
    width: width * 1.2,
    height: height * 0.25,
  },
  orangeWave: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: height * 0.32,
    paddingBottom: 60,
    justifyContent: 'space-between',
  },
  taglineSection: {
    marginBottom: 20,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B35',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  poweredByContainer: {
    marginTop: 4,
  },
  poweredByText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  headlineRegular: {
    fontSize: 44,
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 52,
    letterSpacing: -0.5,
  },
  headlineHighlight: {
    fontSize: 44,
    fontWeight: '700',
    color: '#FF6B35',
    lineHeight: 52,
    letterSpacing: -0.5,
  },
  buttonWrapper: {
    width: '100%',
  },
  button: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 20,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default OnboardingScreen;
