import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const WhiteOrangeBackground = () => {
  // Animated blob
  const blobPosition = useRef(new Animated.Value(0)).current;
  const blobScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Gentle blob animation
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(blobPosition, {
            toValue: 1,
            duration: 20000,
            useNativeDriver: true,
          }),
          Animated.timing(blobPosition, {
            toValue: 0,
            duration: 20000,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(blobScale, {
            toValue: 1.15,
            duration: 12000,
            useNativeDriver: true,
          }),
          Animated.timing(blobScale, {
            toValue: 1,
            duration: 12000,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, []);

  const blobTranslateX = blobPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [-30, 30],
  });

  const blobTranslateY = blobPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -40],
  });

  return (
    <View style={styles.container}>
      {/* Base white background */}
      <View style={styles.baseBackground} />

      {/* Animated gradient blob */}
      <Animated.View
        style={[
          styles.blobContainer,
          {
            transform: [
              { translateX: blobTranslateX },
              { translateY: blobTranslateY },
              { scale: blobScale },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255, 107, 53, 0.08)', 'rgba(255, 140, 70, 0.04)', 'rgba(255, 107, 53, 0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.blob}
        />
      </Animated.View>

      {/* Subtle secondary blob */}
      <View style={styles.secondaryBlob}>
        <LinearGradient
          colors={['rgba(255, 160, 90, 0.05)', 'rgba(255, 107, 53, 0.02)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.blob}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: width,
    height: height,
    backgroundColor: '#FFFFFF',
  },
  baseBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  blobContainer: {
    position: 'absolute',
    top: -width * 0.3,
    right: -width * 0.4,
  },
  blob: {
    width: width * 1.4,
    height: width * 1.4,
    borderRadius: 9999,
  },
  secondaryBlob: {
    position: 'absolute',
    bottom: -width * 0.5,
    left: -width * 0.5,
    opacity: 0.6,
  },
});

export default WhiteOrangeBackground;
