import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/hooks/useTranslation';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError(t('auth.invalid_credentials'));
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

        <h1 className="mb-6 text-center text-2xl font-bold text-white">{t('auth.login_title')}</h1>

        {error && (
          <div className="mb-4 rounded-md bg-red-500/20 p-3 text-center text-sm text-red-400" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-gray-300">{t('auth.email')}</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-label={t('auth.email')}
              aria-describedby={error ? 'login-error' : undefined}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-400 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              placeholder={t('auth.enter_email')}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-gray-300">{t('auth.password')}</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-label={t('auth.password')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-400 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              placeholder={t('auth.enter_password')}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-full bg-green-500 py-3 font-bold text-black transition-colors hover:bg-green-400 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-green-500"
          >
            {isLoading ? t('auth.logging_in') : t('auth.login')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          {t('auth.no_account')}{' '}
          <Link to="/register" className="text-green-500 hover:underline focus-visible:outline-2 focus-visible:outline-green-500">
            {t('auth.register')}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
