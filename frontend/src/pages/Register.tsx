import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/hooks/useTranslation';

const Register = () => {
  const [email, setEmail] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.passwords_no_match'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.password_min_length'));
      return;
    }

    try {
      await register(email, pseudo, password, inviteToken || undefined);
      navigate('/login');
    } catch {
      setError(t('auth.registration_failed'));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <div className="w-full max-w-md rounded-lg bg-gray-900 p-8 shadow-xl">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500">
            <span className="text-lg font-bold text-black">S</span>
          </div>
          <span className="text-2xl font-bold text-white">Alt Spotify</span>
        </div>

        <h1 className="mb-6 text-center text-2xl font-bold text-white">{t('auth.register_title')}</h1>

        {inviteToken ? (
          <div className="mb-4 rounded-md bg-green-500/20 p-3 text-center text-sm text-green-400">
            {t('auth.invite_valid')}
          </div>
        ) : (
          <div className="mb-4 rounded-md bg-yellow-500/20 p-3 text-center text-sm text-yellow-400">
            {t('auth.invite_required')}
            <br />
            <span className="text-xs opacity-75">{t('auth.no_invite')}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md bg-red-500/20 p-3 text-center text-sm text-red-400" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-email" className="mb-1 block text-sm font-medium text-gray-300">{t('auth.email')}</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-label={t('auth.email')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-400 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              placeholder={t('auth.enter_email')}
            />
          </div>

          <div>
            <label htmlFor="reg-pseudo" className="mb-1 block text-sm font-medium text-gray-300">{t('auth.display_name')}</label>
            <input
              id="reg-pseudo"
              type="text"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              required
              aria-label={t('auth.display_name')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-400 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              placeholder={t('auth.choose_display_name')}
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="mb-1 block text-sm font-medium text-gray-300">{t('auth.password')}</label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-label={t('auth.password')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-400 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              placeholder={t('auth.create_password')}
            />
          </div>

          <div>
            <label htmlFor="reg-confirm" className="mb-1 block text-sm font-medium text-gray-300">{t('auth.confirm_password')}</label>
            <input
              id="reg-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              aria-label={t('auth.confirm_password')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-400 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              placeholder={t('auth.confirm_your_password')}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-full bg-green-500 py-3 font-bold text-black transition-colors hover:bg-green-400 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-green-500"
          >
            {isLoading ? t('auth.creating_account') : t('auth.sign_up')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          {t('auth.has_account')}{' '}
          <Link to="/login" className="text-green-500 hover:underline focus-visible:outline-2 focus-visible:outline-green-500">
            {t('auth.login')}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
