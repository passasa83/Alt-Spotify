import { useTranslation } from '@/hooks/useTranslation';
const SkipToContent = () => {
  const { t } = useTranslation();
  return (
    <a
      href="#main-content"
      className="fixed left-0 top-0 z-[100] -translate-y-full bg-green-500 px-4 py-3 text-sm font-bold text-black transition-transform focus:translate-y-0"
    >
      {t('a11y.skip_to_content')}
    </a>
  );
};

export default SkipToContent;
