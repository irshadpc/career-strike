import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Outlet } from '@tanstack/react-router';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { UpdateBanner } from './components/Updates';
import { Button } from './components/ui/button';
import { ToastProvider } from './components/ui/toast';
import { RETRY_MS, useConnection } from './connection';
import { Link, usePath } from './router';

const PRIMARY_NAV = [
  { href: '/', label: 'Home' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/applications', label: 'Applications' },
  { href: '/resume', label: 'Resume Studio' },
  { href: '/outreach', label: 'Outreach' },
] as const;

const WORKSPACE_NAV = [
  { href: '/markets', label: 'Markets' },
  { href: '/profile', label: 'Profile' },
  { href: '/insights', label: 'Insights' },
  { href: '/activity', label: 'Activity' },
  { href: '/settings', label: 'Settings' },
] as const;

function isCurrent(href: string, path: string): boolean {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`) || (href === '/opportunities' && path.startsWith('/jobs/'));
}

/** Masthead, navigation and footer around every dashboard page. */
export function Shell() {
  const { connection, generation, logout } = useConnection();
  const path = usePath();
  const [mobileOpen, setMobileOpen] = useState(false);

  const workspaceActive = WORKSPACE_NAV.find((item) => isCurrent(item.href, path));
  const workspaceLabel = workspaceActive ? workspaceActive.label : 'Workspace';

  return (
    <ToastProvider>
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pb-16 min-h-screen flex flex-col">
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-foreground focus:text-background focus:rounded-md focus:shadow-lg focus:outline-none"
          href="#main"
        >
          Skip to content
        </a>
        <header className="flex items-center justify-between gap-4 px-5 py-3.5 mt-5 bg-card/85 border border-border border-b-2 border-b-foreground rounded-xl shadow-xs backdrop-blur-md">
          <Link href="/" className="text-2xl font-bold font-serif text-foreground tracking-tight no-underline">
            Career <span className="text-primary italic font-medium">Strike</span>
          </Link>

          {/* Desktop primary nav */}
          <nav aria-label="Primary" className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {PRIMARY_NAV.map((item) => {
              const active = isCurrent(item.href, path);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-block px-3 py-1.5 rounded-md text-sm font-medium transition-colors no-underline ${
                    active
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    workspaceActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                  aria-label="Workspace menu"
                >
                  {workspaceLabel}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[160px] rounded-lg border border-border bg-card p-1 shadow-lg z-50"
                  sideOffset={6}
                >
                  {WORKSPACE_NAV.map((item) => {
                    const active = isCurrent(item.href, path);
                    return (
                      <DropdownMenu.Item key={item.href} asChild>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={`block px-3 py-1.5 rounded-md text-sm no-underline ${
                            active
                              ? 'bg-primary/10 text-primary font-semibold'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                        >
                          {item.label}
                        </Link>
                      </DropdownMenu.Item>
                    );
                  })}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </nav>

          {/* Desktop sign out */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void logout()}
            className="hidden md:inline-flex text-muted-foreground hover:text-foreground"
          >
            Sign out
          </Button>

          {/* Mobile menu trigger */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md border border-border text-foreground"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {/* Mobile drawer */}
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50 md:hidden" />
            <Dialog.Content
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-card border-r border-border p-5 flex flex-col gap-4 md:hidden focus:outline-none"
              aria-label="Mobile navigation"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold font-serif">Career Strike</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2">
                  Core workflow
                </p>
                {PRIMARY_NAV.map((item) => {
                  const active = isCurrent(item.href, path);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`block px-3 py-2 rounded-md text-sm font-medium no-underline ${
                        active
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2">
                  Workspace
                </p>
                {WORKSPACE_NAV.map((item) => {
                  const active = isCurrent(item.href, path);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`block px-3 py-2 rounded-md text-sm font-medium no-underline ${
                        active
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              <div className="mt-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMobileOpen(false);
                    void logout();
                  }}
                  className="w-full justify-start text-muted-foreground hover:text-foreground"
                >
                  Sign out
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {connection === 'unavailable' && (
          <div
            className="my-4 p-4 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-sm shadow-xs"
            role="status"
          >
            <strong>The Career Strike service is not responding.</strong> Your data is safe on this device. Retrying
            every {RETRY_MS / 1000} seconds — or run{' '}
            <code className="px-1 py-0.5 rounded bg-muted">career-strike start</code>.
          </div>
        )}

        <main id="main" tabIndex={-1} key={generation} className="flex-1 mt-6 outline-none">
          <UpdateBanner />
          <Outlet />
        </main>

        <footer className="mt-16 pt-6 border-t border-border text-center text-xs text-muted-foreground space-y-1">
          <p className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground">Career Strike</p>
          <p className="text-muted-foreground">
            Local-first and private by design — your data never leaves this computer.
          </p>
        </footer>
      </div>
    </ToastProvider>
  );
}

export default Shell;
