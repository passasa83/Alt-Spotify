import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Platform } from 'react-native';

export const configureBackgroundAudio = async () => {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.MixWithOthers,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.warn('Failed to configure background audio:', error);
  }
};

export const enableAudioMode = async () => {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.MixWithOthers,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.warn('Failed to enable audio mode:', error);
  }
};

export const setAudioInterruptionMode = async () => {
  try {
    if (Platform.OS === 'ios') {
      await Audio.setAudioModeAsync({
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      });
    } else {
      await Audio.setAudioModeAsync({
        interruptionModeAndroid: InterruptionModeAndroid.MixWithOthers,
      });
    }
  } catch (error) {
    console.warn('Failed to set interruption mode:', error);
  }
};
