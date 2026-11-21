import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getSkillFacets, type SkillFacet } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { cn } from '../../../helpers/cn';

interface ProfileResponse {
  facts: {
    id: string;
    kind: string;
    value: { name?: string };
    approved: boolean;
  }[];
}

interface SkillFilterBarProps {
  selectedSkills: string[];
  skillMode: 'any' | 'all';
  excludedSkills: string[];
  onSkillsChange: (skills: string[], mode: 'any' | 'all', excluded: string[]) => void;
  countryFilter?: string;
  remoteFilter?: string;
  queryFilter?: string;
}

export function SkillFilterBar({
  selectedSkills,
  skillMode,
  excludedSkills,
  onSkillsChange,
  countryFilter,
  remoteFilter,
  queryFilter,
}: SkillFilterBarProps) {
  const [facets, setFacets] = useState<SkillFacet[]>([]);
  const [loadingFacets, setLoadingFacets] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch live skill facets whenever active macro filters change
  useEffect(() => {
    let active = true;
    setLoadingFacets(true);
    getSkillFacets({ country: countryFilter, remote: remoteFilter, q: queryFilter })
      .then((res) => {
        if (active) setFacets(res.skills);
      })
      .catch(() => {
        if (active) setFacets([]);
      })
      .finally(() => {
        if (active) setLoadingFacets(false);
      });

    return () => {
      active = false;
    };
  }, [countryFilter, remoteFilter, queryFilter]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Filter facets by user query, excluding already selected or excluded
  const filteredFacets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return facets.filter((f) => {
      if (selectedSkills.includes(f.slug) || excludedSkills.includes(f.slug)) return false;
      if (!q) return true;
      return f.label.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q);
    });
  }, [facets, query, selectedSkills, excludedSkills]);

  const addSkill = (slug: string) => {
    if (!selectedSkills.includes(slug)) {
      const nextSelected = [...selectedSkills, slug];
      const nextExcluded = excludedSkills.filter((s) => s !== slug);
      onSkillsChange(nextSelected, skillMode, nextExcluded);
    }
    setQuery('');
    setDropdownOpen(false);
  };

  const addExcludedSkill = (slug: string) => {
    if (!excludedSkills.includes(slug)) {
      const nextExcluded = [...excludedSkills, slug];
      const nextSelected = selectedSkills.filter((s) => s !== slug);
      onSkillsChange(nextSelected, skillMode, nextExcluded);
    }
    setQuery('');
    setDropdownOpen(false);
  };

  const removeSkill = (slug: string) => {
    onSkillsChange(
      selectedSkills.filter((s) => s !== slug),
      skillMode,
      excludedSkills,
    );
  };

  const removeExcludedSkill = (slug: string) => {
    onSkillsChange(
      selectedSkills,
      skillMode,
      excludedSkills.filter((s) => s !== slug),
    );
  };

  const setMode = (newMode: 'any' | 'all') => {
    if (newMode !== skillMode) {
      onSkillsChange(selectedSkills, newMode, excludedSkills);
    }
  };

  const clearAllSkills = () => {
    onSkillsChange([], 'any', []);
  };

  const handleApplyProfileSkills = async () => {
    setLoadingProfile(true);
    try {
      const res = await api<ProfileResponse>('/api/profile');
      const confirmedNames = res.facts
        .filter((f) => f.kind === 'skill' && f.approved && f.value.name)
        .map((f) => f.value.name!.toLowerCase());

      if (confirmedNames.length === 0) return;

      // Find matching facets by slug or label
      const matchedSlugs: string[] = [];
      for (const facet of facets) {
        if (
          confirmedNames.some(
            (c) =>
              c === facet.slug.toLowerCase() ||
              c === facet.label.toLowerCase() ||
              c.includes(facet.label.toLowerCase()),
          )
        ) {
          matchedSlugs.push(facet.slug);
        }
      }

      if (matchedSlugs.length > 0) {
        onSkillsChange(matchedSlugs, 'any', excludedSkills);
      }
    } catch {
      // Profile load failed or unauthenticated
    } finally {
      setLoadingProfile(false);
    }
  };

  const facetMap = useMemo(() => new Map(facets.map((f) => [f.slug, f.label])), [facets]);

  const hasActiveFilters = selectedSkills.length > 0 || excludedSkills.length > 0;

  return (
    <div className="my-3 p-3.5 rounded-lg border border-border bg-card shadow-xs space-y-3" ref={containerRef}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Skill Filters</span>
          {loadingFacets && <span className="text-[10px] text-muted-foreground animate-pulse">updating counts…</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset Button: My Profile Skills */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleApplyProfileSkills()}
            disabled={loadingProfile}
            className="text-xs h-7 px-2.5 font-medium"
            title="Load your confirmed profile skills as active filter chips"
          >
            {loadingProfile ? 'Loading profile…' : '⚡ My Profile Skills'}
          </Button>

          {/* ANY / ALL Segmented Toggle */}
          <div
            className="inline-flex rounded-md border border-input bg-background p-0.5 text-xs shadow-xs"
            role="group"
            aria-label="Skill match logic"
          >
            <button
              type="button"
              onClick={() => setMode('any')}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                skillMode === 'any'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Match ANY (OR)
            </button>
            <button
              type="button"
              onClick={() => setMode('all')}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                skillMode === 'all'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Match ALL (AND)
            </button>
          </div>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAllSkills}
              className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              Clear skills
            </Button>
          )}
        </div>
      </div>

      {/* Typeahead Combobox */}
      <div className="relative max-w-md">
        <Input
          type="text"
          placeholder="Filter or exclude skills (e.g. TypeScript, React, Docker)…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          className="h-8 text-xs pr-8"
          aria-label="Search skills to include or exclude"
        />

        {dropdownOpen && (
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg py-1 text-xs">
            {filteredFacets.length === 0 ? (
              <div className="px-3 py-2 text-muted-foreground text-center">No matching skills found</div>
            ) : (
              filteredFacets.slice(0, 15).map((f) => (
                <div
                  key={f.slug}
                  className="px-3 py-1.5 flex items-center justify-between hover:bg-muted/80 cursor-pointer transition-colors"
                >
                  <span className="font-medium text-foreground">
                    {f.label} <span className="text-muted-foreground font-normal">({f.count})</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => addSkill(f.slug)}
                      className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium text-[11px] border border-emerald-500/30 transition-colors"
                      title={`Match roles requiring ${f.label}`}
                    >
                      + Require
                    </button>
                    <button
                      type="button"
                      onClick={() => addExcludedSkill(f.slug)}
                      className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-medium text-[11px] border border-rose-500/30 transition-colors"
                      title={`Exclude roles requiring ${f.label}`}
                    >
                      - Exclude
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Active Skill Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1" aria-label="Active skill filters">
          {selectedSkills.map((slug) => {
            const label = facetMap.get(slug) || slug;
            return (
              <span
                key={slug}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30 shadow-2xs"
              >
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => removeSkill(slug)}
                  className="ml-0.5 hover:text-emerald-950 dark:hover:text-emerald-100 rounded-full focus:outline-none"
                  aria-label={`Remove ${label}`}
                >
                  ×
                </button>
              </span>
            );
          })}

          {excludedSkills.map((slug) => {
            const label = facetMap.get(slug) || slug;
            return (
              <span
                key={slug}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/15 text-rose-800 dark:text-rose-200 border border-rose-500/30 shadow-2xs"
              >
                <span>-{label}</span>
                <button
                  type="button"
                  onClick={() => removeExcludedSkill(slug)}
                  className="ml-0.5 hover:text-rose-950 dark:hover:text-rose-100 rounded-full focus:outline-none"
                  aria-label={`Remove exclude ${label}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
