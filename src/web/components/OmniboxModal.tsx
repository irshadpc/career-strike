import {
  Activity,
  Award,
  BarChart3,
  Briefcase,
  Compass,
  DollarSign,
  FileText,
  Home,
  Layers,
  type LucideIcon,
  Moon,
  PlusCircle,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type JobSummary } from '../api';
import { useNavigateTo } from '../router';

export interface OmniboxModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleTheme?: () => void;
  currentTheme?: 'light' | 'dark' | 'system';
}

interface CommandItem {
  id: string;
  category: 'Navigation' | 'Actions' | 'Opportunities';
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  badge?: string;
  onSelect: () => void;
}

export function OmniboxModal({ open, onOpenChange, onToggleTheme, currentTheme = 'system' }: OmniboxModalProps) {
  const navigate = useNavigateTo();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced live search for jobs when query has >= 2 chars
  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setJobs([]);
      setLoadingJobs(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingJobs(true);
      try {
        const res = await api<{ jobs: JobSummary[] }>(`/api/jobs?q=${encodeURIComponent(trimmed)}&limit=5`);
        setJobs(res.jobs ?? []);
      } catch {
        setJobs([]);
      } finally {
        setLoadingJobs(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, open]);

  // Static Navigation Destinations
  const navItems: CommandItem[] = useMemo(
    () => [
      {
        id: 'nav-home',
        category: 'Navigation',
        title: 'Home Cockpit',
        subtitle: 'Daily focus, next best actions, and status',
        icon: Home,
        onSelect: () => {
          navigate('/');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-opportunities',
        category: 'Navigation',
        title: 'Opportunities Explorer',
        subtitle: 'Search and filter active job postings by skills and market',
        icon: Briefcase,
        onSelect: () => {
          navigate('/opportunities');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-resume',
        category: 'Navigation',
        title: 'Resume Studio',
        subtitle: 'ATS-verified exports, Google XYZ linter, and X-Ray lens',
        icon: FileText,
        onSelect: () => {
          navigate('/resume');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-autopilot',
        category: 'Navigation',
        title: 'Autopilot Queue & Answer Vault',
        subtitle: 'Pick → Ask → Write → Track runtime, screening vault, and receipt history',
        icon: Sparkles,
        onSelect: () => {
          navigate('/autopilot');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-applications',
        category: 'Navigation',
        title: 'Applications Tracker',
        subtitle: 'Review submissions, stages, and upcoming interviews',
        icon: Send,
        onSelect: () => {
          navigate('/applications');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-contacts',
        category: 'Navigation',
        title: 'Warm-Path Contacts & Referral CRM',
        subtitle: 'Manage professional network and warm referral paths',
        icon: Users,
        onSelect: () => {
          navigate('/contacts');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-star-vault',
        category: 'Navigation',
        title: 'STAR Story Vault & Voice Lab',
        subtitle: 'Behavioral interview stories and voice simulator',
        icon: Award,
        onSelect: () => {
          navigate('/star-vault');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-offers',
        category: 'Navigation',
        title: 'Offer Intelligence Lab',
        subtitle: '4-year compensation modeler, equity, and tax calculator',
        icon: DollarSign,
        onSelect: () => {
          navigate('/offers');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-hired',
        category: 'Navigation',
        title: 'Hired Mode',
        subtitle: '30-60-90 day onboarding plan and stakeholder map',
        icon: Sparkles,
        onSelect: () => {
          navigate('/hired');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-compare',
        category: 'Navigation',
        title: 'Side-by-Side Job Comparison',
        subtitle: 'Compare requirements, compensation, and signals',
        icon: Layers,
        onSelect: () => {
          navigate('/opportunities/compare');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-markets',
        category: 'Navigation',
        title: 'Markets & Hiring Pulse',
        subtitle: 'Regional benchmarks and macroeconomic hiring trends',
        icon: Compass,
        onSelect: () => {
          navigate('/markets');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-insights',
        category: 'Navigation',
        title: 'Funnel Leak Insights',
        subtitle: 'Diagnostic conversion funnel from apply to offer',
        icon: BarChart3,
        onSelect: () => {
          navigate('/insights');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-sources',
        category: 'Navigation',
        title: 'Source Boards & Sync Health',
        subtitle: 'Inspect ATS feeds, Greenhouse, Lever, Ashby, and Adzuna',
        icon: RefreshCw,
        onSelect: () => {
          navigate('/opportunities/sources');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-profile',
        category: 'Navigation',
        title: 'Profile & Career Facts',
        subtitle: 'Manage verified skills, roles, and career evidence',
        icon: User,
        onSelect: () => {
          navigate('/profile');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-activity',
        category: 'Navigation',
        title: 'Activity Ledger',
        subtitle: 'Audit log of actions, syncs, and discoveries',
        icon: Activity,
        onSelect: () => {
          navigate('/activity');
          onOpenChange(false);
        },
      },
      {
        id: 'nav-settings',
        category: 'Navigation',
        title: 'Settings & Privacy Rules',
        subtitle: 'Configure search criteria, API keys, and local defaults',
        icon: Settings,
        onSelect: () => {
          navigate('/settings');
          onOpenChange(false);
        },
      },
    ],
    [navigate, onOpenChange],
  );

  // Quick Actions
  const actionItems: CommandItem[] = useMemo(
    () => [
      {
        id: 'action-theme',
        category: 'Actions',
        title: `Switch Theme (Current: ${currentTheme})`,
        subtitle: 'Toggle between Light and Dark mode',
        icon: currentTheme === 'dark' ? Sun : Moon,
        onSelect: () => {
          onToggleTheme?.();
          onOpenChange(false);
        },
      },
      {
        id: 'action-sync',
        category: 'Actions',
        title: 'Sync All Active Job Boards',
        subtitle: 'Trigger background ingestion across configured ATS sources',
        icon: RefreshCw,
        onSelect: () => {
          navigate('/opportunities/sources');
          onOpenChange(false);
        },
      },
      {
        id: 'action-new-job',
        category: 'Actions',
        title: 'Add Unverified Job Manually',
        subtitle: 'Import a job listing URL or paste raw text',
        icon: PlusCircle,
        onSelect: () => {
          navigate('/opportunities/new');
          onOpenChange(false);
        },
      },
      {
        id: 'action-new-resume',
        category: 'Actions',
        title: 'Create Tailored Resume Variant',
        subtitle: 'Open the Resume Studio Master Vault overlay',
        icon: FileText,
        onSelect: () => {
          navigate('/resume');
          onOpenChange(false);
        },
      },
    ],
    [navigate, onOpenChange, onToggleTheme, currentTheme],
  );

  // Live Job Search Items
  const jobActionItems: CommandItem[] = useMemo(
    () =>
      jobs.map((j) => ({
        id: `job-${j.id}`,
        category: 'Opportunities' as const,
        title: `${j.title} — ${j.employer}`,
        subtitle: `${j.normalizedLocation || j.locationText || 'Remote'} • ${j.workMode || j.remotePolicy}`,
        badge: j.fit ? `${j.fit.tier.toUpperCase()} FIT` : undefined,
        icon: Briefcase,
        onSelect: () => {
          navigate(`/jobs/${j.id}`);
          onOpenChange(false);
        },
      })),
    [jobs, navigate, onOpenChange],
  );

  // Filter items by user query
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...actionItems, ...navItems];
    }
    const matchingNav = navItems.filter(
      (item) => item.title.toLowerCase().includes(q) || item.subtitle?.toLowerCase().includes(q),
    );
    const matchingActions = actionItems.filter(
      (item) => item.title.toLowerCase().includes(q) || item.subtitle?.toLowerCase().includes(q),
    );
    return [...jobActionItems, ...matchingActions, ...matchingNav];
  }, [query, navItems, actionItems, jobActionItems]);

  // Adjust selection bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation inside Omnibox
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, filteredItems.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredItems[selectedIndex];
      if (item) item.onSelect();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0 duration-150"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Universal Command Omnibox"
    >
      <div
        className="w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[75vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-muted/20">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, job, company, or destination..."
            className="flex-1 bg-transparent border-none outline-none text-base text-foreground placeholder:text-muted-foreground/70"
            autoComplete="off"
            spellCheck="false"
          />
          {loadingJobs && <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-background border border-border text-muted-foreground shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Results Stream */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No matching commands or opportunities found for &quot;{query}&quot;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const selected = idx === selectedIndex;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left text-sm transition-colors ${
                    selected
                      ? 'bg-primary/10 text-primary font-medium ring-1 ring-primary/20 shadow-2xs'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        selected ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{item.title}</div>
                      {item.subtitle && <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                        {item.badge}
                      </span>
                    )}
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground/70 tracking-wider">
                      {item.category}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Omnibox Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono bg-background border border-border px-1 rounded">↑</kbd>{' '}
              <kbd className="font-mono bg-background border border-border px-1 rounded">↓</kbd> to navigate
            </span>
            <span>
              <kbd className="font-mono bg-background border border-border px-1 rounded">↵</kbd> to select
            </span>
          </div>
          <span>Career Strike Omnibox</span>
        </div>
      </div>
    </div>
  );
}
