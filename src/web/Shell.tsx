import { Outlet } from '@tanstack/react-router';
import {
  Activity,
  Award,
  BarChart3,
  Briefcase,
  Compass,
  DollarSign,
  FileText,
  Home,
  Keyboard,
  Layers,
  LayoutGrid,
  type LucideIcon,
  Mail,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { OmniboxModal } from './components/OmniboxModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Loading } from './components/states';
import { UpdateBanner } from './components/Updates';
import { Button } from './components/ui/button';
import { ToastProvider } from './components/ui/toast';
import { RETRY_MS, useConnection } from './connection';
import { Link, usePath } from './router';
import { applyTheme, getStoredTheme, type Theme } from './theme';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  isSecondary?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/opportunities', label: 'Opportunities', icon: Briefcase },
  { href: '/markets', label: 'Markets', icon: Compass },
  { href: '/resume', label: 'Resume Studio', icon: FileText },
  { href: '/autopilot', label: 'Autopilot', icon: Sparkles },
  { href: '/applications', label: 'Applications', icon: Send },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/outreach', label: 'Outreach', icon: Mail },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const SPECIALIZED_NAV: NavItem[] = [
  { href: '/contacts', label: 'Contacts', icon: Users, isSecondary: true },
  { href: '/star-vault', label: 'STAR Vault', icon: Award, isSecondary: true },
  { href: '/offers', label: 'Offer Lab', icon: DollarSign, isSecondary: true },
  { href: '/hired', label: 'Hired Mode', icon: Sparkles, isSecondary: true },
  { href: '/opportunities/compare', label: 'Compare', icon: Layers, isSecondary: true },
  { href: '/opportunities/sources', label: 'Sync Health', icon: RefreshCw, isSecondary: true },
];

function isCurrent(href: string, path: string): boolean {
  if (href === '/') return path === '/';
  if (href === '/opportunities') {
    return path === '/opportunities' || path.startsWith('/jobs/') || path.startsWith('/opportunities/new');
  }
  return path === href || path.startsWith(`${href}/`);
}

/** World-class Google Workspace-style layout with M3 Tonal Pills, Omnibox, and Fluid Canvas. */
export function Shell() {
  const { connection, generation, logout } = useConnection();
  const path = usePath();
  const [showSpecialized, setShowSpecialized] = useState(false);
  const [isOmniboxOpen, setIsOmniboxOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');

  // Load and apply initial theme
  useEffect(() => {
    const saved = getStoredTheme();
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
    setTheme(next);
    applyTheme(next);
  };

  // Global ⌘K / ? / / keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOmniboxOpen((prev) => !prev);
        return;
      }

      if (!isInput) {
        if (e.key === '?') {
          e.preventDefault();
          setIsShortcutsOpen((prev) => !prev);
        } else if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setIsOmniboxOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/15 selection:text-primary">
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-foreground focus:text-background focus:rounded-md focus:shadow-lg focus:outline-none"
          href="#main"
        >
          Skip to content
        </a>

        {/* Global Sticky Editorial Header & Navigation */}
        <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-md">
          <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-3">
            {/* Top Row: Brand + Omnibox + Actions */}
            <div className="flex items-center justify-between gap-4 pb-2.5 flex-wrap">
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="text-xl sm:text-2xl font-bold font-serif text-foreground tracking-tight no-underline"
                >
                  Career{' '}
                  <span style={{ color: 'var(--color-brand-warm)' }} className="italic font-semibold">
                    Strike
                  </span>
                </Link>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold bg-subtle text-ink-secondary border border-border">
                  Local-First
                </span>
              </div>

              {/* Quick Action / Omnibox Launcher */}
              <button
                type="button"
                onClick={() => setIsOmniboxOpen(true)}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-md bg-subtle/70 hover:bg-subtle border border-border text-xs text-muted-foreground transition-colors sm:w-56 lg:w-80 text-left group cursor-pointer"
                title="Jump to jobs, skills, commands (⌘K)"
              >
                <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="hidden md:inline flex-1 text-left truncate">Jump to jobs, skills, commands...</span>
                <span className="md:hidden text-xs font-medium">Jump</span>
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface border border-border text-foreground font-semibold">
                  ⌘K
                </kbd>
              </button>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowSpecialized(!showSpecialized)}
                  aria-expanded={showSpecialized}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                    showSpecialized
                      ? 'bg-accent text-accent-fg border-transparent font-semibold'
                      : 'border-border bg-surface text-foreground hover:bg-subtle'
                  }`}
                  title="Toggle specialized tools (Contacts, STAR Vault, Offer Lab, Hired Mode, Compare, Sync Health)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Tools</span>
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="p-1.5 rounded-md border border-transparent text-muted-foreground hover:text-foreground hover:bg-subtle transition-colors cursor-pointer"
                  title={`Switch theme (current: ${theme})`}
                  aria-label={`Switch theme (current: ${theme})`}
                >
                  {theme === 'dark' ? (
                    <Moon className="w-4 h-4 text-primary" />
                  ) : theme === 'light' ? (
                    <Sun className="w-4 h-4 text-foreground" />
                  ) : (
                    <Monitor className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsShortcutsOpen(true)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-subtle transition-colors hidden sm:inline-flex cursor-pointer"
                  title="Keyboard shortcuts (?)"
                  aria-label="Keyboard shortcuts"
                >
                  <Keyboard className="w-4 h-4" />
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void logout()}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Sign out
                </Button>
              </div>
            </div>

            {/* Bottom Row: Clean Architectural Tab Strip */}
            <nav aria-label="Primary" className="w-full overflow-x-auto border-t border-border/70">
              <ul className="flex items-center flex-wrap gap-1 m-0 p-0 list-none">
                {PRIMARY_NAV.map((item) => {
                  const active = isCurrent(item.href, path);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-[13px] font-medium border-b-2 transition-colors no-underline -mb-px ${
                          active
                            ? 'border-primary text-primary font-semibold'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}

                {/* Specialized Tools Strip if Toggled or on active route */}
                {SPECIALIZED_NAV.map((item) => {
                  const active = isCurrent(item.href, path);
                  if (!showSpecialized && !active) return null;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-[13px] font-medium border-b-2 transition-colors no-underline -mb-px ${
                          active
                            ? 'border-primary text-primary font-semibold'
                            : 'border-transparent text-foreground/80 hover:text-foreground hover:border-border'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </header>

        {/* Connection Outage Banner */}
        {connection === 'unavailable' && (
          <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mt-4">
            <div
              className="p-4 rounded-xl border border-status-warn-border bg-status-warn-bg text-status-warn-fg text-sm shadow-xs"
              role="status"
            >
              <strong>The Career Strike service is not responding.</strong> Your data is safe on this device. Retrying
              every {RETRY_MS / 1000} seconds — or run{' '}
              <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">career-strike start</code>.
            </div>
          </div>
        )}

        {/* Fluid Main Workspace Canvas (Expanded up to 1600px) */}
        <main
          id="main"
          tabIndex={-1}
          key={generation}
          className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mt-6 outline-none pb-16 flex flex-col"
        >
          <UpdateBanner />
          <Suspense fallback={<Loading label="Loading view" />}>
            <Outlet />
          </Suspense>
        </main>

        {/* Footer */}
        <footer className="mt-auto py-6 border-t border-border text-center text-xs text-muted-foreground space-y-1">
          <p className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground">Career Strike</p>
          <p className="text-muted-foreground">
            Local-first and private by design — your data never leaves this computer.
          </p>
        </footer>

        {/* Global Omnibox & Shortcuts Modals */}
        <OmniboxModal
          open={isOmniboxOpen}
          onOpenChange={setIsOmniboxOpen}
          currentTheme={theme}
          onToggleTheme={toggleTheme}
        />
        <ShortcutsModal open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen} />
      </div>
    </ToastProvider>
  );
}

export default Shell;
