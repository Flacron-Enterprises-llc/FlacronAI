import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const WaveShape = () => {
  const wave1Anim = useRef(new Animated.Value(0)).current;
  const wave2Anim = useRef(new Animated.Value(0)).current;
  const wave3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Subtle floating animation for waves
    Animated.loop(
      Animated.sequence([
        Animated.timing(wave1Anim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(wave1Anim, {
          toValue: 0,
          duration: 8000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(wave2Anim, {
          toValue: 1,
          duration: 10000,
          useNativeDriver: true,
        }),
        Animated.timing(wave2Anim, {
          toValue: 0,
          duration: 10000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(wave3Anim, {
          toValue: 1,
          duration: 12000,
          useNativeDriver: true,
        }),
        Animated.timing(wave3Anim, {
          toValue: 0,
          duration: 12000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const wave1TranslateY = wave1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });

  const wave2TranslateY = wave2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 5],
  });

  const wave3TranslateY = wave3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });

  return (
    <View style={styles.container}>
      {/* Wave Layer 1 - Deep Black (Top, curved right) */}
      <Animated.View
        style={[
          styles.waveLayer,
          {
            transform: [{ translateY: wave1TranslateY }],
          },
        ]}
      >
        <Svg
          height={height * 0.5}
          width={width}
          viewBox={`0 0 ${width} ${height * 0.5}`}
          style={styles.waveSvg}
        >
          <Path
            d={`M 0 0 Q ${width * 0.5} ${height * 0.25} ${width} ${height * 0.15} L ${width} 0 Z`}
            fill="#0a0a0a"
          />
        </Svg>
      </Animated.View>

      {/* Wave Layer 2 - Bright Orange (Middle) */}
      <Animated.View
        style={[
          styles.waveLayer,
          {
            transform: [{ translateY: wave2TranslateY }],
          },
        ]}
      >
        <Svg
          height={height * 0.48}
          width={width}
          viewBox={`0 0 ${width} ${height * 0.48}`}
          style={styles.waveSvg}
        >
          <Path
            d={`M 0 0 Q ${width * 0.6} ${height * 0.3} ${width} ${height * 0.2} L ${width} 0 Z`}
            fill="#FF6B35"
          />
        </Svg>
      </Animated.View>

      {/* Wave Layer 3 - Soft Orange (Bottom, light) */}
      <Animated.View
        style={[
          styles.waveLayer,
          {
            transform: [{ translateY: wave3TranslateY }],
          },
        ]}
      >
        <Svg
          height={height * 0.45}
          width={width}
          viewBox={`0 0 ${width} ${height * 0.45}`}
          style={styles.waveSvg}
        >
          <Path
            d={`M 0 0 Q ${width * 0.7} ${height * 0.32} ${width} ${height * 0.25} L ${width} 0 Z`}
            fill="#FF8C42"
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
    width: width,
    height: height * 0.5,
    overflow: 'hidden',
  },
  waveLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height * 0.5,
  },
  waveSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

export default WaveShape;
