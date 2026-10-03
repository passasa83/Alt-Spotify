import * as SecureStore from 'expo-secure-store';

/**
 * Server address: EXPO_PUBLIC_API_URL (see .env.example), production otherwise.
 * From a phone, "localhost" is the phone itself.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://app.musicgratos.duckdns.org/api/v1').replace(
  /\/$/,
  '',
);

const ACCESS = 'access_token';
const REFRESH = 'refresh_token';

// Tokens live in the OS keychain / keystore, not in plain AsyncStorage.
export const getAccessToken = () => SecureStore.getItemAsync(ACCESS);
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH);

export const saveTokens = async (access: string, refresh: string) => {
  await SecureStore.setItemAsync(ACCESS, access);
  await SecureStore.setItemAsync(REFRESH, refresh);
};

// Caches tied to the session (the media token) register here to be dropped on logout.
const clearListeners = new Set<() => void>();
export const onTokensCleared = (listener: () => void) => {
  clearListeners.add(listener);
};

export const clearTokens = async () => {
  clearListeners.forEach((listener) => listener());
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
};
