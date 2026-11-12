import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { brand } from '@/theme/brand';

interface UserAvatarProps {
  size?: number;
  /** Used for the initial when no picture is available. */
  name?: string | null;
  /** White ring, for avatars that sit on the navy surfaces. */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The signed-in user's profile picture: their uploaded avatar, else the photo from
 * their Google account, else their initial on brand orange. A broken image URL
 * falls back to the initial instead of showing an empty circle.
 */
export function UserAvatar({ size = 48, name, ring = false, style }: UserAvatarProps) {
  const { userProfile, firebaseUser } = useAuth();
  const uri = userProfile?.avatarUrl || firebaseUser?.photoURL || null;
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const label = (name || userProfile?.displayName || firebaseUser?.email || 'U').trim();
  const showImage = !!uri && failedUri !== uri;

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        ring && styles.ring,
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={showImage ? 'Profile picture' : `Profile initial ${label.charAt(0).toUpperCase()}`}
    >
      {showImage ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          onError={() => setFailedUri(uri)}
        />
      ) : (
        <Text style={[styles.initial, { fontSize: Math.round(size * 0.4) }]}>{label.charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  initial: { color: '#FFFFFF', fontFamily: 'SpaceGrotesk_700Bold' },
});
