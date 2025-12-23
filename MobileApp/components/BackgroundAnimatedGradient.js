import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const BackgroundAnimatedGradient = () => {
  // Main bubble
  const bubblePosition = useRef(new Animated.Value(0)).current;
  const bubbleOpacity = useRef(new Animated.Value(0.6)).current;
  const bubbleScale = useRef(new Animated.Value(1)).current;

  // Accent ring around bubble
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.3)).current;

  // Floating particles (5 small elegant dots)
  const particle1 = useRef(new Animated.Value(0)).current;
  const particle2 = useRef(new Animated.Value(0)).current;
  const particle3 = useRef(new Animated.Value(0)).current;
  const particle4 = useRef(new Animated.Value(0)).current;
  const particle5 = useRef(new Animated.Value(0)).current;

  // Subtle ambient glow
  const ambientGlow = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Main bubble animation (slow, elegant drift)
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(bubblePosition, {
            toValue: 1,
            duration: 28000,
            useNativeDriver: true,
          }),
          Animated.timing(bubblePosition, {
            toValue: 0,
            duration: 28000,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(bubbleOpacity, {
            toValue: 0.8,
            duration: 10000,
            useNativeDriver: true,
          }),
          Animated.timing(bubbleOpacity, {
            toValue: 0.6,
            duration: 10000,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(bubbleScale, {
            toValue: 1.12,
            duration: 16000,
            useNativeDriver: true,
          }),
          Animated.timing(bubbleScale, {
            toValue: 1,
            duration: 16000,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();

    // Accent ring animation (pulses outward)
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringScale, {
            toValue: 1.3,
            duration: 6000,
            useNativeDriver: true,
          }),
          Animated.timing(ringScale, {
            toValue: 1,
            duration: 6000,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(ringOpacity, {
            toValue: 0.5,
            duration: 6000,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.2,
            duration: 6000,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();

    // Ambient glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(ambientGlow, {
          toValue: 0.7,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(ambientGlow, {
          toValue: 0.5,
          duration: 8000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Particle 1 (slow rise)
    Animated.loop(
      Animated.sequence([
        Animated.timing(particle1, {
          toValue: 1,
          duration: 15000,
          useNativeDriver: true,
        }),
        Animated.timing(particle1, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Particle 2 (medium rise)
    Animated.loop(
      Animated.sequence([
        Animated.delay(3000),
        Animated.timing(particle2, {
          toValue: 1,
          duration: 18000,
          useNativeDriver: true,
        }),
        Animated.timing(particle2, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Particle 3 (gentle drift)
    Animated.loop(
      Animated.sequence([
        Animated.delay(6000),
        Animated.timing(particle3, {
          toValue: 1,
          duration: 20000,
          useNativeDriver: true,
        }),
        Animated.timing(particle3, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Particle 4 (slow float)
    Animated.loop(
      Animated.sequence([
        Animated.delay(9000),
        Animated.timing(particle4, {
          toValue: 1,
          duration: 22000,
          useNativeDriver: true,
        }),
        Animated.timing(particle4, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Particle 5 (elegant rise)
    Animated.loop(
      Animated.sequence([
        Animated.delay(12000),
        Animated.timing(particle5, {
          toValue: 1,
          duration: 17000,
          useNativeDriver: true,
        }),
        Animated.timing(particle5, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Interpolations
  const bubbleTranslateX = bubblePosition.interpolate({
    inputRange: [0, 1],
    outputRange: [-35, 35],
  });

  const bubbleTranslateY = bubblePosition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -25],
  });

  // Particle interpolations (rise and fade)
  const particle1TranslateY = particle1.interpolate({
    inputRange: [0, 1],
    outputRange: [height + 50, -150],
  });
  const particle1Opacity = particle1.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.8, 0.7, 0],
  });

  const particle2TranslateY = particle2.interpolate({
    inputRange: [0, 1],
    outputRange: [height + 50, -150],
  });
  const particle2Opacity = particle2.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.7, 0.6, 0],
  });

  const particle3TranslateY = particle3.interpolate({
    inputRange: [0, 1],
    outputRange: [height + 50, -150],
  });
  const particle3Opacity = particle3.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.9, 0.8, 0],
  });

  const particle4TranslateY = particle4.interpolate({
    inputRange: [0, 1],
    outputRange: [height + 50, -150],
  });
  const particle4Opacity = particle4.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.6, 0.5, 0],
  });

  const particle5TranslateY = particle5.interpolate({
    inputRange: [0, 1],
    outputRange: [height + 50, -150],
  });
  const particle5Opacity = particle5.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.85, 0.75, 0],
  });

  return (
    <View style={styles.container}>
      {/* Base background */}
      <View style={styles.baseBackground} />

      {/* Ambient glow layer */}
      <Animated.View
        style={[
          styles.ambientGlow,
          {
            opacity: ambientGlow,
          },
        ]}
      />

      {/* Main bubble with glow */}
      <Animated.View
        style={[
          styles.bubble,
          {
            opacity: bubbleOpacity,
            transform: [
              { translateX: bubbleTranslateX },
              { translateY: bubbleTranslateY },
              { scale: bubbleScale },
            ],
          },
        ]}
      />

      {/* Accent ring around bubble */}
      <Animated.View
        style={[
          styles.accentRing,
          {
            opacity: ringOpacity,
            transform: [
              { translateX: bubbleTranslateX },
              { translateY: bubbleTranslateY },
              { scale: ringScale },
            ],
          },
        ]}
      />

      {/* Elegant floating particles */}
      <Animated.View
        style={[
          styles.particle1,
          {
            opacity: particle1Opacity,
            transform: [{ translateY: particle1TranslateY }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.particle2,
          {
            opacity: particle2Opacity,
            transform: [{ translateY: particle2TranslateY }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.particle3,
          {
            opacity: particle3Opacity,
            transform: [{ translateY: particle3TranslateY }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.particle4,
          {
            opacity: particle4Opacity,
            transform: [{ translateY: particle4TranslateY }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.particle5,
          {
            opacity: particle5Opacity,
            transform: [{ translateY: particle5TranslateY }],
          },
        ]}
      />

      {/* Gradient overlay for depth */}
      <View style={styles.gradientOverlay} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: width,
    height: height,
    backgroundColor: '#000000',
  },
  baseBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#0a0a0a',
  },
  ambientGlow: {
    position: 'absolute',
    width: width * 2,
    height: width * 2,
    backgroundColor: 'rgba(255, 120, 50, 0.03)',
    top: -width * 0.7,
    right: -width * 0.6,
    borderRadius: 9999,
  },
  bubble: {
    position: 'absolute',
    width: width * 1.5,
    height: width * 1.5,
    backgroundColor: 'rgba(255, 130, 67, 0.16)',
    top: -width * 0.45,
    right: -width * 0.35,
    borderRadius: 9999,
    shadowColor: '#ff8243',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 140,
    elevation: 15,
  },
  accentRing: {
    position: 'absolute',
    width: width * 1.3,
    height: width * 1.3,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'rgba(255, 150, 80, 0.15)',
    top: -width * 0.35,
    right: -width * 0.25,
    borderRadius: 9999,
    shadowColor: '#ff9650',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 60,
  },
  particle1: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 130, 67, 0.8)',
    left: '20%',
    bottom: 0,
    shadowColor: '#ff8243',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  particle2: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 150, 80, 0.7)',
    left: '70%',
    bottom: 0,
    shadowColor: '#ff9650',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
  particle3: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 140, 70, 0.85)',
    left: '40%',
    bottom: 0,
    shadowColor: '#ff8c46',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 7,
  },
  particle4: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 120, 60, 0.6)',
    left: '55%',
    bottom: 0,
    shadowColor: '#ff783c',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  particle5: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 160, 90, 0.75)',
    left: '85%',
    bottom: 0,
    shadowColor: '#ffa05a',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 6,
  },
  gradientOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
});

export default BackgroundAnimatedGradient;
