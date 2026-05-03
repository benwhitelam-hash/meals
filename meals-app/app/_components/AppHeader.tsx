'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CrocMark } from '../croc';

interface AppHeaderProps {
  // Whether to show the "memory" icon (only on /meals)
  showMemoryButton?: boolean;
  memoryCount?: number;
  onOpenMemory?: () => void;
  onOpenPrefs?: () => void;
}

interface PersonalApp {
  key: string;
  name: string;
  href: string;
  status: 'live' | 'soon';
  icon: string; // emoji-style label
}

const PERSONAL_APPS: PersonalApp[] = [
  { key: 'meals', name: 'Meals', href: 'https://meals.pinkcrocodile.dev', status: 'live', icon: '🍳' },
  { key: 'books', name: 'Books', href: '#', status: 'soon', icon: '📚' },
  { key: 'budget', name: 'Budget', href: '#', status: 'soon', icon: '💰' },
];

const PRIMARY_NAV = [
  { href: '/', label: 'Meals' },
  { href: '/recipes', label: 'Recipes' },
  { href: '/plan', label: 'Plan' },
  { href: '/shopping', label: 'Shopping' },
];

export function AppHeader({
  showMemoryButton = false,
  memoryCount = 0,
  onOpenMemory,
  onOpenPrefs,
}: AppHeaderProps) {
  const [me, setMe] = useState<string | null>(null);
  const [appsOpen, setAppsOpen] = useState(false);
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setMe(d.user))
      .catch(() => setMe(null));
  }, []);

  // Close dropdown on outside click + Escape
  useEffect(() => {
    if (!appsOpen) return;
    function onClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setAppsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAppsOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [appsOpen]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="app-header">
      <div className="brand-wrap" ref={dropdownRef}>
        <button
          type="button"
          className={`brand brand-button ${appsOpen ? 'is-open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={appsOpen}
          aria-label="Pink Crocodile — switch apps"
          onClick={() => setAppsOpen((v) => !v)}
        >
          <CrocMark size={28} />
          <span className="brand-name">pink crocodile</span>
          <svg
            className="brand-chevron"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {appsOpen && (
          <div className="apps-menu" role="menu">
            <div className="apps-menu-eyebrow">Personal apps</div>
            {PERSONAL_APPS.map((app) => {
              const isCurrent = app.key === 'meals';
              const isPlaceholder = app.status === 'soon';
              return (
                <a
                  key={app.key}
                  href={isPlaceholder ? undefined : app.href}
                  className={`apps-menu-item ${isCurrent ? 'is-current' : ''} ${
                    isPlaceholder ? 'is-disabled' : ''
                  }`}
                  role="menuitem"
                  aria-disabled={isPlaceholder || undefined}
                  onClick={(e) => {
                    if (isPlaceholder) {
                      e.preventDefault();
                      return;
                    }
                    setAppsOpen(false);
                  }}
                >
                  <span className="apps-menu-icon" aria-hidden="true">
                    {app.icon}
                  </span>
                  <span className="apps-menu-name">{app.name}</span>
                  {isCurrent && <span className="apps-menu-tag">current</span>}
                  {isPlaceholder && <span className="apps-menu-tag soon">soon</span>}
                </a>
              );
            })}
            <div className="apps-menu-rule" role="separator" />
            <Link
              href="/feedback"
              className="apps-menu-item apps-menu-feedback"
              role="menuitem"
              onClick={() => setAppsOpen(false)}
            >
              <span className="apps-menu-icon" aria-hidden="true">
                💡
              </span>
              <span className="apps-menu-name">Suggest a feature</span>
            </Link>
            <a
              href="https://pinkcrocodile.dev"
              className="apps-menu-item apps-menu-foot"
              role="menuitem"
              onClick={() => setAppsOpen(false)}
            >
              <span className="apps-menu-icon" aria-hidden="true">
                🏡
              </span>
              <span className="apps-menu-name">pinkcrocodile.dev</span>
            </a>
          </div>
        )}
      </div>

      <nav className="app-nav-wrap" aria-label="Primary">
        <div className="app-nav">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive(item.href) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="user-menu">
        {me && (
          <span className="who">
            <strong>{me}</strong>
          </span>
        )}
        {showMemoryButton && (
          <button
            className="icon-btn mem-icon-btn"
            onClick={onOpenMemory}
            aria-label="Memories"
            title="Memories"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path
                d="M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.5-7 11-7 11z"
                strokeLinejoin="round"
              />
            </svg>
            {memoryCount > 0 && <span className="mem-count">{memoryCount}</span>}
          </button>
        )}
        {onOpenPrefs && (
          <button
            className="icon-btn"
            onClick={onOpenPrefs}
            aria-label="Household preferences"
            title="Household preferences"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
        <button className="btn btn-ghost btn-signout" onClick={logout} title="Sign out">
          Sign out
        </button>
      </div>
    </header>
  );
}
