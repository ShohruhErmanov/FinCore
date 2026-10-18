import { NavLink } from 'react-router-dom';
import { SETTING_TABS, type SettingKind } from './settings-config';

export function SettingsTabs({ active }: { active: SettingKind }) {
  return (
    <nav
      aria-label="Sozlamalar bo‘limlari"
      className="mb-5 flex flex-wrap gap-1 border-b border-border"
    >
      {SETTING_TABS.map((tab) => (
        <NavLink
          key={tab.kind}
          to={tab.to}
          aria-current={tab.kind === active ? 'page' : undefined}
          className={`-mb-px min-h-11 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab.kind === active
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
