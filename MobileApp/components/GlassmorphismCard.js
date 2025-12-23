import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const GlassmorphismCard = ({
  children,
  style,
  intensity = 20,
  borderRadius = 16,
  padding = 20,
  withBorder = true,
}) => {
  // Dark theme glassmorphism effect
  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {/* Gradient overlay for dark glassmorphic effect */}
      <LinearGradient
        colors={[
          'rgba(255, 255, 255, 0.15)',
          'rgba(255, 255, 255, 0.08)',
          'rgba(255, 255, 255, 0.15)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradientOverlay,
          {
            borderRadius,
            borderWidth: withBorder ? 1 : 0,
          },
        ]}
      >
        {/* Inner glow effect */}
        <View
          style={[
            styles.innerGlow,
            {
              borderRadius: borderRadius - 1,
            },
          ]}
        >
          <View style={{ padding }}>
            {children}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Outer shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  gradientOverlay: {
    flex: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    // Additional subtle shadow
    shadowColor: 'rgba(255, 107, 53, 0.2)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  innerGlow: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
});

export default GlassmorphismCard;
