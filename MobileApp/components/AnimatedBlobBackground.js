import React, { useEffect, useRef } from 'react';
import { View, Dimensions, StyleSheet, Animated } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const AnimatedBlobBackground = ({ style }) => {
  // Blob 1 - Large top-right
  const blob1X = useRef(new Animated.Value(0)).current;
  const blob1Y = useRef(new Animated.Value(0)).current;
  const blob1Scale = useRef(new Animated.Value(1)).current;

  // Blob 2 - Medium center
  const blob2X = useRef(new Animated.Value(0)).current;
  const blob2Y = useRef(new Animated.Value(0)).current;
  const blob2Scale = useRef(new Animated.Value(1)).current;

  // Blob 3 - Small bottom-left
  const blob3X = useRef(new Animated.Value(0)).current;
  const blob3Y = useRef(new Animated.Value(0)).current;
  const blob3Scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Blob 1 animation - Slow drift
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob1X, {
          toValue: 30,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(blob1X, {
          toValue: -30,
          duration: 8000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(blob1Y, {
          toValue: 20,
          duration: 6000,
          useNativeDriver: true,
        }),
        Animated.timing(blob1Y, {
          toValue: -20,
          duration: 6000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(blob1Scale, {
          toValue: 1.1,
          duration: 5000,
          useNativeDriver: true,
        }),
        Animated.timing(blob1Scale, {
          toValue: 1,
          duration: 5000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 2 animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob2X, {
          toValue: -25,
          duration: 7000,
          useNativeDriver: true,
        }),
        Animated.timing(blob2X, {
          toValue: 25,
          duration: 7000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(blob2Y, {
          toValue: -15,
          duration: 9000,
          useNativeDriver: true,
        }),
        Animated.timing(blob2Y, {
          toValue: 15,
          duration: 9000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(blob2Scale, {
          toValue: 1.15,
          duration: 6000,
          useNativeDriver: true,
        }),
        Animated.timing(blob2Scale, {
          toValue: 0.95,
          duration: 6000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 3 animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob3X, {
          toValue: 20,
          duration: 6500,
          useNativeDriver: true,
        }),
        Animated.timing(blob3X, {
          toValue: -20,
          duration: 6500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(blob3Y, {
          toValue: -25,
          duration: 7500,
          useNativeDriver: true,
        }),
        Animated.timing(blob3Y, {
          toValue: 25,
          duration: 7500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(blob3Scale, {
          toValue: 1.2,
          duration: 5500,
          useNativeDriver: true,
        }),
        Animated.timing(blob3Scale, {
          toValue: 0.9,
          duration: 5500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={[styles.container, style]} pointerEvents="none">
      {/* Blob 1 - Top Right */}
      <Animated.View
        style={[
          styles.blob1,
          {
            transform: [
              { translateX: blob1X },
              { translateY: blob1Y },
              { scale: blob1Scale },
            ],
          },
        ]}
      >
        <Svg height={height * 0.4} width={width * 0.8}>
          <Ellipse
            cx={width * 0.4}
            cy={height * 0.2}
            rx={width * 0.35}
            ry={height * 0.15}
            fill="#FF8A00"
            opacity={0.2}
          />
        </Svg>
      </Animated.View>

      {/* Blob 2 - Center */}
      <Animated.View
        style={[
          styles.blob2,
          {
            transform: [
              { translateX: blob2X },
              { translateY: blob2Y },
              { scale: blob2Scale },
            ],
          },
        ]}
      >
        <Svg height={height * 0.3} width={width * 0.6}>
          <Ellipse
            cx={width * 0.3}
            cy={height * 0.15}
            rx={width * 0.25}
            ry={height * 0.12}
            fill="#FF8A00"
            opacity={0.15}
          />
        </Svg>
      </Animated.View>

      {/* Blob 3 - Bottom Left */}
      <Animated.View
        style={[
          styles.blob3,
          {
            transform: [
              { translateX: blob3X },
              { translateY: blob3Y },
              { scale: blob3Scale },
            ],
          },
        ]}
      >
        <Svg height={height * 0.35} width={width * 0.7}>
          <Ellipse
            cx={width * 0.35}
            cy={height * 0.175}
            rx={width * 0.3}
            ry={height * 0.13}
            fill="#FF4F00"
            opacity={0.12}
          />
        </Svg>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  blob1: {
    position: 'absolute',
    top: -height * 0.1,
    right: -width * 0.2,
  },
  blob2: {
    position: 'absolute',
    top: height * 0.25,
    left: -width * 0.1,
  },
  blob3: {
    position: 'absolute',
    bottom: height * 0.1,
    left: -width * 0.15,
  },
});

export default AnimatedBlobBackground;
