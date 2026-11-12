import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { UserAvatar } from '@/components/brand/UserAvatar';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { usersApi } from '@/services/api/users';
import { brand } from '@/theme/brand';
import { ApiRequestError } from '@/types/api';
import { Notice } from './AccountScaffold';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

function mimeOf(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType === 'image/jpg' ? 'image/jpeg' : asset.mimeType;
  const ext = asset.uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** Profile picture with Take photo / Choose from library / Remove. Square crop happens in the picker and again on the server. */
export function AvatarEditor() {
  const { userProfile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const hasUploaded = !!userProfile?.avatarUrl;

  const upload = async (asset: ImagePicker.ImagePickerAsset) => {
    const type = mimeOf(asset);
    if (!ALLOWED.includes(type)) {
      setError('Please choose a JPG, PNG or WebP image.');
      return;
    }
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
      setError('That image is larger than 2 MB. Please choose a smaller one.');
      return;
    }
    setBusy(true);
    try {
      await usersApi.uploadAvatar({ uri: asset.uri, name: `avatar.${type.split('/')[1]}`, type });
      await refreshProfile();
      setDone('Profile picture updated.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const pick = async (source: 'camera' | 'library') => {
    setError(null);
    setDone(null);
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in Settings to take a profile picture.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        exif: false,
      };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      await upload(result.assets[0]);
    } catch {
      setError('Could not open the picker. Please try again.');
    }
  };

  const remove = () => {
    Alert.alert('Remove profile picture?', 'Your initial will be shown instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError(null);
          setDone(null);
          try {
            await usersApi.removeAvatar();
            await refreshProfile();
            setDone('Profile picture removed.');
          } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : 'Could not remove the picture. Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const openMenu = () => {
    if (busy) return;
    const buttons = [
      ...(Platform.OS === 'web' ? [] : [{ text: 'Take photo', onPress: () => pick('camera') }]),
      { text: 'Choose from library', onPress: () => pick('library') },
      ...(hasUploaded ? [{ text: 'Remove picture', style: 'destructive' as const, onPress: remove }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    if (Platform.OS === 'web') {
      pick('library');
      return;
    }
    Alert.alert('Profile picture', undefined, buttons);
  };

  return (
    <View style={styles.wrap}>
      <Pressable onPress={openMenu} accessibilityRole="button" accessibilityLabel="Change profile picture" disabled={busy}>
        <UserAvatar size={96} />
        <View style={styles.badge}>
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="camera" size={16} color="#FFFFFF" />}
        </View>
      </Pressable>
      <Pressable onPress={openMenu} disabled={busy} hitSlop={8} accessibilityRole="button">
        <Text style={styles.link}>{busy ? 'Saving…' : hasUploaded ? 'Change picture' : 'Add a profile picture'}</Text>
      </Pressable>
      <Notice tone="error" text={error} />
      <Notice tone="success" text={done} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  link: { color: brand.orange, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
