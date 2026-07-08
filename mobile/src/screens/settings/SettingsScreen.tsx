import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../utils/theme';
import { useAuthStore } from '../../stores/authStore';
import { updateProfile } from '../../api/users';
import { registerForPushNotifications, sendPushTokenToServer, removePushTokenFromServer } from '../../services/pushNotifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, setUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.pseudo || '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadNotificationPreference();
  }, []);

  const loadNotificationPreference = async () => => {
    const pref = await AsyncStorage.getItem('push_notifications_enabled');
    setNotificationsEnabled(pref !== 'false');
  };

  const handleNotificationsToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('push_notifications_enabled', String(value));

    if (value) {
      const token = await registerForPushNotifications();
      if (token) {
        await sendPushTokenToServer(token);
      }
    } else {
      const token = await AsyncStorage.getItem('push_token');
      if (token) {
        await removePushTokenFromServer(token);
        await AsyncStorage.removeItem('push_token');
      }
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Display name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProfile({ pseudo: displayName.trim() });
      setUser(updated);
      Alert.alert('Success', 'Profile updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveText, saving && styles.saveDisabled]}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={48} color={colors.textMuted} />
          </View>
          <TouchableOpacity>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Email</Text>
            <Text style={styles.fieldValue}>{user?.email}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
              <Text style={styles.switchLabel}>Push Notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: colors.card, true: colors.primary }}
              thumbColor={colors.text}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.aboutItem}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  saveText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  saveDisabled: {
    color: colors.textMuted,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  changePhotoText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  field: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  fieldValue: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  fieldInput: {
    fontSize: fontSize.md,
    color: colors.text,
    padding: 0,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  switchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  switchLabel: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  aboutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  aboutLabel: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  aboutValue: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
});
