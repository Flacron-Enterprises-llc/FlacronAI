import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Clear all user data from AsyncStorage
 * USE THIS ONLY FOR DEBUGGING
 */
export const clearAllUserData = async () => {
  try {
    await AsyncStorage.clear();
    console.log('✅ All AsyncStorage data cleared!');
    return { success: true };
  } catch (error) {
    console.error('❌ Error clearing AsyncStorage:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Log all current AsyncStorage data
 */
export const logAllStorageData = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const items = await AsyncStorage.multiGet(keys);

    console.log('📦 Current AsyncStorage Data:');
    items.forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });

    return items;
  } catch (error) {
    console.error('❌ Error reading AsyncStorage:', error);
    return [];
  }
};
