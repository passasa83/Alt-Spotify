import { Link } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';

const NotFound = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <h1 className="mb-4 text-6xl font-bold text-white">404</h1>
      <p className="mb-8 text-xl text-gray-400">{t('common.page_not_found')}</p>
      <Link
        to="/"
        className="rounded-full bg-white px-6 py-3 font-bold text-black transition-colors hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-green-500"
      >
        {t('common.go_home')}
      </Link>
    </div>
  );
};

export default NotFound;
