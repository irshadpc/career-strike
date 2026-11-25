import { FileText, Keyboard, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from './ui/button';

export interface ShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  { keys: ['⌘', 'K'], description: 'Open Omnibox command palette & search', category: 'Navigation' },
  { keys: ['?'], description: 'Open keyboard shortcuts cheatsheet', category: 'Navigation' },
  { keys: ['Esc'], description: 'Close active modal, drawer, or palette', category: 'Navigation' },
  { keys: ['/'], description: 'Focus quick search input', category: 'Navigation' },
  { keys: ['↑', '↓'], description: 'Navigate items in Omnibox & dropdowns', category: 'Controls' },
  { keys: ['Enter'], description: 'Execute selected command or open job', category: 'Controls' },
  { keys: ['Peek'], description: 'Instant slide-over JD review without losing scroll', category: 'Opportunities' },
  { keys: ['Compare'], description: 'Side-by-side role and benefits evaluation', category: 'Opportunities' },
];

export function ShortcutsModal({ open, onOpenChange }: ShortcutsModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      prevFocus?.focus?.();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0 duration-150"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground leading-tight m-0">Keyboard Shortcuts</h2>
              <p className="text-xs text-muted-foreground m-0">Fast-path keys for power users</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
            aria-label="Close shortcuts modal"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Shortcuts List */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-2">
            {SHORTCUTS.map((item, idx) => (
              <div
                key={`${item.keys.join('-')}-${idx}`}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground font-medium">{item.description}</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    {item.category}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {item.keys.map((k) => (
                    <kbd
                      key={k}
                      className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-muted border border-border text-foreground shadow-2xs"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Google Elite Design Principles Highlights */}
          <div className="pt-4 border-t border-border grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Local-First Vault</span>
              </div>
              <p className="text-[11px] text-muted-foreground m-0">
                100% private SQLite storage. No remote telemetry or cloud scraping.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <FileText className="w-4 h-4 text-primary" />
                <span>ATS-Verified Studio</span>
              </div>
              <p className="text-[11px] text-muted-foreground m-0">
                Playwright Tagged PDF &amp; Pure OpenXML DOCX round-trip verified.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-muted/20 border-t border-border text-center text-xs text-muted-foreground">
          Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[11px]">Esc</kbd> to
          close at any time
        </div>
      </div>
    </div>
  );
}
