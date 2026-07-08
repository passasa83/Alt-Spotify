import { useCallback } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useA11y() {
  const announce = useCallback((message: string) => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, []);

  const isScreenReaderEnabled = useCallback(async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      return await AccessibilityInfo.isScreenReaderEnabled();
    }
    return false;
  }, []);

  const setAccessibilityFocus = useCallback(() => {
    if (Platform.OS === 'ios') {
      AccessibilityInfo.setAccessibilityFocus();
    }
  }, []);

  return { announce, isScreenReaderEnabled, setAccessibilityFocus };
}
