import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Platform } from 'react-native';

export const configureBackgroundAudio = async () => {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.warn('Failed to configure background audio:', error);
  }
};

export const setAudioInterruptionMode = async () => {
  try {
    if (Platform.OS === 'ios') {
      await Audio.setAudioModeAsync({
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      });
    } else {
      await Audio.setAudioModeAsync({
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });
    }
  } catch (error) {
    console.warn('Failed to set interruption mode:', error);
  }
};
