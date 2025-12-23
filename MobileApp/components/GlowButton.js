import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  View,
} from 'react-native';

const GlowButton = ({
  title,
  onPress,
  variant = 'primary', // 'primary' (white) or 'secondary' (dark)
  style,
  textStyle,
}) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const glowValue = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleValue, {
        toValue: 0.96,
        useNativeDriver: true,
        friction: 3,
      }),
      Animated.timing(glowValue, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleValue, {
        toValue: 1,
        useNativeDriver: true,
        friction: 3,
      }),
      Animated.timing(glowValue, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const isPrimary = variant === 'primary';

  const glowOpacity = glowValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleValue }],
        },
        style,
      ]}
    >
      {/* Glow effect */}
      <Animated.View
        style={[
          styles.glowContainer,
          isPrimary ? styles.glowPrimary : styles.glowSecondary,
          {
            opacity: glowOpacity,
          },
        ]}
      />

      {/* Button */}
      <TouchableOpacity
        style={[
          styles.button,
          isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
      >
        {/* Glass effect overlay */}
        <View style={styles.glassOverlay} />

        <Text
          style={[
            styles.buttonText,
            isPrimary ? styles.textPrimary : styles.textSecondary,
            textStyle,
          ]}
        >
          {title}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  glowContainer: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 16,
    zIndex: 0,
  },
  glowPrimary: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  glowSecondary: {
    backgroundColor: 'rgba(100, 100, 100, 0.3)',
    shadowColor: '#666666',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 8,
  },
  button: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  buttonPrimary: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  buttonSecondary: {
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  glassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  textPrimary: {
    color: '#000000',
  },
  textSecondary: {
    color: '#ffffff',
  },
});

export default GlowButton;
