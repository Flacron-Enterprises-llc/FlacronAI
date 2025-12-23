import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const GlassInput = ({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  icon,
  style,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const glowValue = useRef(new Animated.Value(0)).current;
  const labelPosition = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    if (value) {
      Animated.timing(labelPosition, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [value]);

  const handleFocus = () => {
    setIsFocused(true);
    Animated.parallel([
      Animated.timing(glowValue, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(labelPosition, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.timing(glowValue, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();

    if (!value) {
      Animated.timing(labelPosition, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  };

  const borderColor = glowValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0.1)', 'rgba(255, 130, 67, 0.6)'],
  });

  const glowOpacity = glowValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  const labelTranslateY = labelPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -36],
  });

  const labelScale = labelPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.85],
  });

  return (
    <View style={[styles.container, style]}>
      {/* Glow effect */}
      <Animated.View
        style={[
          styles.glowContainer,
          {
            opacity: glowOpacity,
            shadowColor: '#ff8243',
          },
        ]}
      />

      {/* Floating label - Outside input container for better positioning */}
      <Animated.Text
        style={[
          styles.label,
          icon && styles.labelWithIcon,
          {
            transform: [
              { translateY: labelTranslateY },
              { scale: labelScale },
            ],
          },
          (isFocused || value) && styles.labelFocused,
        ]}
      >
        {label}
      </Animated.Text>

      {/* Input container */}
      <Animated.View
        style={[
          styles.inputContainer,
          {
            borderColor: borderColor,
          },
        ]}
      >
        {/* Glass overlay */}
        <View style={styles.glassOverlay} />

        {/* Icon - Fixed alignment with absolute positioning */}
        {icon && (
          <View style={styles.iconContainer}>
            <MaterialIcons name={icon} size={22} color="rgba(255, 255, 255, 0.5)" />
          </View>
        )}

        {/* Text input */}
        <TextInput
          style={[
            styles.input,
            icon && styles.inputWithIcon,
            secureTextEntry && styles.inputWithEye,
          ]}
          placeholder={isFocused ? placeholder : ''}
          placeholderTextColor="rgba(255, 255, 255, 0.3)"
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={secureTextEntry && !isPasswordVisible}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          selectionColor="rgba(255, 130, 67, 0.8)"
        />

        {/* Password visibility toggle - Fixed alignment */}
        {secureTextEntry && (
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons
              name={isPasswordVisible ? 'visibility' : 'visibility-off'}
              size={22}
              color="rgba(255, 255, 255, 0.5)"
            />
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: 24,
    width: '100%',
  },
  glowContainer: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 8,
  },
  label: {
    position: 'absolute',
    left: 16,
    top: 20,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    fontWeight: '400',
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  labelWithIcon: {
    left: 52,
  },
  labelFocused: {
    color: 'rgba(255, 130, 67, 0.9)',
    fontSize: 12,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 20, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    height: 60,
    paddingHorizontal: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  glassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  iconContainer: {
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: 0,
    width: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '400',
    height: 60,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    textAlignVertical: 'center',
  },
  inputWithIcon: {
    paddingLeft: 38,
  },
  inputWithEye: {
    paddingRight: 44,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    width: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
});

export default GlassInput;
