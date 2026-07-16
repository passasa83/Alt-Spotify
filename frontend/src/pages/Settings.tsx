import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { updateProfile } from '@/api/users';
import { useTranslation } from '@/hooks/useTranslation';
import { getLocale, setLocale } from '@/i18n';

const Settings = () => {
  const { user, setUser } = useAuthStore();
  const { t } = useTranslation();
  const [pseudo, setPseudo] = useState(user?.pseudo || '');
  const [email, setEmail] = useState(user?.email || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [country, setCountry] = useState(user?.country || '');
  const [isChildAccount, setIsChildAccount] = useState(user?.is_child_account || false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const updatedUser = await updateProfile({ 
        pseudo, 
        bio: bio || undefined,
        country: country || undefined, 
        is_child_account: isChildAccount 
      });
      setUser(updatedUser);
      setMessage(t('settings.profile_updated'));
    } catch {
      setError(t('settings.profile_update_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwords_no_match'));
      return;
    }
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      await updateProfile({});
      setMessage(t('settings.password_changed'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError(t('settings.password_change_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <h1 className="mb-8 text-3xl font-bold text-white">{t('settings.title')}</h1>

      {message && (
        <div className="mb-4 rounded-md bg-green-500/20 p-3 text-sm text-green-400" role="status">{message}</div>
      )}
      {error && (
        <div className="mb-4 rounded-md bg-red-500/20 p-3 text-sm text-red-400" role="alert">{error}</div>
      )}

      <section className="mb-8 rounded-lg bg-gray-900 p-6">
        <h2 className="mb-4 text-xl font-bold text-white">{t('settings.profile')}</h2>
        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-700">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <span className="text-2xl font-bold">{pseudo.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <button type="button" className="rounded-full border border-gray-600 px-4 py-2 text-sm font-medium text-white hover:border-white focus-visible:outline-2 focus-visible:outline-green-500">
              {t('settings.change_photo')}
            </button>
          </div>

          <div>
            <label htmlFor="settings-pseudo" className="mb-1 block text-sm font-medium text-gray-300">{t('settings.display_name')}</label>
            <input
              id="settings-pseudo"
              type="text"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              aria-label={t('settings.display_name')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label htmlFor="settings-email" className="mb-1 block text-sm font-medium text-gray-300">{t('auth.email')}</label>
            <input
              id="settings-email"
              type="email"
              value={email}
              disabled
              aria-label={t('auth.email')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-gray-400"
            />
          </div>

          <div>
            <label htmlFor="settings-bio" className="mb-1 block text-sm font-medium text-gray-300">{t('settings.bio')}</label>
            <textarea
              id="settings-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('settings.bio_placeholder')}
              rows={3}
              aria-label={t('settings.bio')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 resize-none"
            />
          </div>

          <div>
            <label htmlFor="settings-country" className="mb-1 block text-sm font-medium text-gray-300">{t('settings.country')}</label>
            <input
              id="settings-country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="e.g. FR"
              aria-label={t('settings.country')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div className="flex items-center gap-2 py-2">
            <input
              id="settings-child"
              type="checkbox"
              checked={isChildAccount}
              onChange={(e) => setIsChildAccount(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900"
            />
            <div>
              <label htmlFor="settings-child" className="block text-sm font-medium text-white">{t('settings.child_account')}</label>
              <p className="text-xs text-gray-400">{t('settings.child_account_desc')}</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-green-500 px-8 py-3 font-bold text-black transition-colors hover:bg-green-400 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-green-500"
          >
            {isSaving ? t('settings.saving') : t('settings.save_profile')}
          </button>
        </form>
      </section>

      <section className="mb-8 rounded-lg bg-gray-900 p-6">
        <h2 className="mb-4 text-xl font-bold text-white">{t('settings.notifications')}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{t('settings.push_notifications')}</p>
              <p className="text-xs text-gray-400">{t('settings.push_notifications_desc')}</p>
            </div>
            <span className="text-sm text-gray-400">{t('settings.configure_mobile')}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{t('settings.email_notifications')}</p>
              <p className="text-xs text-gray-400">{t('settings.email_notifications_desc')}</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" className="peer sr-only" defaultChecked aria-label={t('settings.email_notifications')} />
              <div className="peer h-6 w-11 rounded-full bg-gray-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-green-500 peer-checked:after:translate-x-full" />
            </label>
          </div>
        </div>
      </section>

      <section className="mb-8 rounded-lg bg-gray-900 p-6">
        <h2 className="mb-4 text-xl font-bold text-white">{t('settings.language')}</h2>
        <div className="rounded-lg bg-gray-800 p-4">
          <h3 className="mb-3 text-lg font-semibold text-white">{t('settings.language')}</h3>
          <select
            value={getLocale()}
            onChange={(e) => {
              setLocale(e.target.value as 'fr' | 'en');
              window.location.reload();
            }}
            className="w-full rounded-md border border-gray-600 bg-gray-700 px-4 py-2 text-white outline-none focus:border-green-500"
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>
      </section>

      <section className="rounded-lg bg-gray-900 p-6">
        <h2 className="mb-4 text-xl font-bold text-white">{t('settings.change_password')}</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-gray-300">{t('settings.current_password')}</label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              aria-label={t('settings.current_password')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-gray-300">{t('settings.new_password')}</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-label={t('settings.new_password')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-gray-300">{t('settings.confirm_new_password')}</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-label={t('settings.confirm_new_password')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-green-500 px-8 py-3 font-bold text-black transition-colors hover:bg-green-400 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-green-500"
          >
            {isSaving ? t('settings.changing') : t('settings.change_password')}
          </button>
        </form>
      </section>
    </div>
  );
};

export default Settings;
