'use client';

import { useEffect, useState } from 'react';
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

export function AppHeader({
  showMemoryButton = false,
  memoryCount = 0,
  onOpenMemory,
  onOpenPrefs,
}: AppHeaderProps) {
  const [me, setMe] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setMe(d.user))
      .catch(() => setMe(null));
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="app-header">
      <Link href="/" className="brand" aria-label="Pink Crocodile">
        <CrocMark size={28} />
        <span className="brand-name">pink crocodile</span>
      </Link>

      <nav className="app-nav" aria-label="Primary">
        <Link href="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
          Meals
        </Link>
        <Link
          href="/recipes"
          className={`nav-link ${isActive('/recipes') ? 'active' : ''}`}
        >
          Recipes
        </Link>
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
        <button className="btn btn-ghost" onClick={logout} title="Sign out">
          Sign out
        </button>
      </div>
    </header>
  );
}
