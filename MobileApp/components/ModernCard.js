import React from 'react';
import { View, StyleSheet } from 'react-native';

const ModernCard = ({
  children,
  style,
  borderRadius = 20,
  padding = 20,
  shadow = true,
}) => {
  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          padding,
          shadowOpacity: shadow ? 0.08 : 0,
          elevation: shadow ? 4 : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
  },
});

export default ModernCard;
