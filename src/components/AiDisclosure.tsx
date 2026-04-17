import { useLanguage } from '../context/LanguageContext';

// Generalized "AI in this app" disclosure. Lists every AI surface (photo,
// reports, chat, insight) and the unified "what the AI never does" promise.
// Pediatric Safety + AI Lead joint requirement.
//
// Used by:
//   - AiDisclosureModal (first-use, lazy-gated per surface)
//   - Settings → Photo Analysis (always-available reference)
export function AiDisclosureContent() {
  const { t } = useLanguage();
  return (
    <div className="text-[14px] leading-relaxed">
      <h4 className="text-[15px] font-semibold mb-2">{t('ai.disclosure.doTitle')}</h4>
      <ul className="space-y-1.5 mb-4 text-text-secondary">
        <Bullet check>{t('ai.disclosure.do.photo')}</Bullet>
        <Bullet check>{t('ai.disclosure.do.reports')}</Bullet>
        <Bullet check>{t('ai.disclosure.do.chat')}</Bullet>
        <Bullet check>{t('ai.disclosure.do.insight')}</Bullet>
      </ul>
      <h4 className="text-[15px] font-semibold mb-2">{t('ai.disclosure.dontTitle')}</h4>
      <ul className="space-y-1.5 mb-4 text-text-secondary">
        <Bullet>{t('ai.disclosure.dont1')}</Bullet>
        <Bullet>{t('ai.disclosure.dont2')}</Bullet>
        <Bullet>{t('ai.disclosure.dont3')}</Bullet>
        <Bullet>{t('ai.disclosure.dont4')}</Bullet>
        <Bullet>{t('ai.disclosure.dont5')}</Bullet>
      </ul>
      <p className="text-[12px] text-text-muted leading-relaxed pt-2 border-t border-border-light">
        {t('ai.disclosure.privacy')}
      </p>
    </div>
  );
}

function Bullet({ check, children }: { check?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`flex-shrink-0 mt-1 ${check ? 'text-accent-green' : 'text-accent-red'}`}>
        {check ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </span>
      <span>{children}</span>
    </li>
  );
}
