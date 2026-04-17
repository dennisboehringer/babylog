import { useLanguage } from '../context/LanguageContext';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function NotesInput({ value, onChange }: Props) {
  const { t } = useLanguage();
  return (
    <div className="mb-4">
      <label className="text-text-secondary text-sm mb-1 block">{t('label.notes')}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        placeholder={t('placeholder.notes')}
        className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-base outline-none focus:ring-2 focus:ring-accent-blue resize-none"
      />
    </div>
  );
}
