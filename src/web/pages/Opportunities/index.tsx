import { Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { AUSTRALIA_SOURCE_ASSESSMENTS, officialAustraliaSearchUrl } from '../../../markets/australia-sources';
import { CANADA_SOURCE_ASSESSMENTS, officialCanadaSearchUrl } from '../../../markets/canada-sources';
import { COUNTRY_CODES, COUNTRY_REGISTRY } from '../../../markets/countries';
import { GERMANY_SOURCE_ASSESSMENTS, officialGermanySearchUrl } from '../../../markets/germany-sources';
import { INDIA_SOURCE_ASSESSMENTS, officialIndiaSearchUrl } from '../../../markets/india-sources';
import { JAPAN_SOURCE_ASSESSMENTS, officialJapanSearchUrl } from '../../../markets/japan-sources';
import { officialSingaporeSearchUrl, SINGAPORE_SOURCE_ASSESSMENTS } from '../../../markets/singapore-sources';
import { officialUaeSearchUrl, UAE_SOURCE_ASSESSMENTS } from '../../../markets/uae-sources';
import { officialUkSearchUrl, UK_SOURCE_ASSESSMENTS } from '../../../markets/uk-sources';
import { api, type Disposition, type JobList, type JobSummary, type SettingsResponse } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Button, buttonVariants } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../helpers/cn';
import { useResource } from '../../hooks/useResource';
import { Link, useNavigateTo, useSearch } from '../../router';
import { CollectionsHub } from './-components/CollectionsHub';
import { CountryFocusViews, OfficialSearches } from './-components/CountryFocusViews';
import { DecisionShortlistHub } from './-components/DecisionShortlistHub';
import { JobRow } from './-components/JobRow';
import { OpportunityPeekDrawer } from './-components/OpportunityPeekDrawer';
import { SkillFilterBar } from './-components/SkillFilterBar';
import { TopMatchSpotlight } from './-components/TopMatchSpotlight';

const PAGE = 50;
const MAX_COMPARE = 4;
const COUNTRY_FILTERS: readonly (readonly [string, string])[] = [
  ['', 'All markets'],
  ...COUNTRY_CODES.map((code) => [code, COUNTRY_REGISTRY[code].name] as const),
];

const FILTERS = {
  status: [
    ['active', 'Open or unverified'],
    ['OPEN', 'Verified open (last 72 h)'],
    ['STALE', 'May have closed'],
    ['UNVERIFIED', 'Added by you'],
    ['CLOSED', 'Closed'],
    ['all', 'Everything'],
  ],
  disposition: [
    ['not_excluded', 'Hide “not for me”'],
    ['none', 'Not reviewed yet'],
    ['shortlisted', 'Shortlisted'],
    ['excluded', 'Marked “not for me”'],
  ],
  remote: [
    ['', 'Any arrangement'],
    ['remote', 'Remote'],
    ['hybrid', 'Hybrid'],
    ['onsite', 'On-site'],
    ['unknown', 'Not stated'],
  ],
  country: COUNTRY_FILTERS,
  source: [
    ['', 'Any source'],
    ['greenhouse', 'Greenhouse'],
    ['lever', 'Lever'],
    ['ashby', 'Ashby'],
    ['remotive', 'Remotive (Global Remote)'],
    ['arbeitnow', 'Arbeitnow (DE/EU)'],
    ['manual', 'Added by you'],
  ],
  tier: [
    ['', 'Any fit'],
    ['strong', 'Strong fit'],
    ['possible', 'Possible fit'],
    ['stretch', 'Stretch'],
    ['eligible', 'Hide “not eligible”'],
    ['ineligible', 'Not eligible'],
  ],
  sort: [
    ['newest', 'Newest first'],
    ['best_fit', 'Best fit'],
    ['recently_verified', 'Recently verified'],
    ['employer', 'Employer A–Z'],
    ['title', 'Title A–Z'],
  ],
} as const;

type FilterKey = keyof typeof FILTERS;

export function Opportunities() {
  const navigate = useNavigateTo();
  const search = useSearch();
  const settings = useResource<SettingsResponse>('/api/settings');
  const params = new URLSearchParams(search);
  const [list, setList] = useState<{ state: 'loading' } | { state: 'error' } | { state: 'ready'; data: JobList }>({
    state: 'loading',
  });
  const [limit, setLimit] = useState(PAGE);
  const searchForm = useForm<{ q: string }>({ defaultValues: { q: params.get('q') ?? '' } });
  const activeQuery = searchForm.watch('q');
  const [compare, setCompare] = useState<string[]>([]);
  const [autopilotQueue, setAutopilotQueue] = useState<string[]>([]);
  const [focusCapRemaining, setFocusCapRemaining] = useState<number>(5);
  const [batchQueueing, setBatchQueueing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api<{ remainingFocusCap: number }>('/api/autopilot/queue')
      .then((r) => setFocusCapRemaining(r.remainingFocusCap))
      .catch(() => {});
  }, [reload]);

  const toggleAutopilot = (id: string) => {
    setAutopilotQueue((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleQueueAutopilot = async () => {
    if (autopilotQueue.length === 0) return;
    setBatchQueueing(true);
    try {
      await api('/api/autopilot/batch', {
        method: 'POST',
        body: { jobIds: autopilotQueue },
      });
      setAutopilotQueue([]);
      navigate('/autopilot');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to queue jobs for Autopilot.');
    } finally {
      setBatchQueueing(false);
    }
  };
  const [viewTab, setViewTab] = useState<'all' | 'collections' | 'shortlist'>('all');
  const [savingLoop, setSavingLoop] = useState(false);
  const saveCurrentFilterAsLoop = async (): Promise<void> => {
    const name = window.prompt('Name this search loop', params.get('q')?.trim() || 'My search loop');
    if (!name) return;
    setSavingLoop(true);
    try {
      const skills = (params.get('skills') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const q = params.get('q')?.trim();
      if (q && !skills.includes(q)) skills.unshift(q);
      const country = params.get('country')?.trim().toUpperCase();
      const remote = params.get('remote');
      const workMode = remote === 'remote' || remote === 'hybrid' || remote === 'onsite' ? remote : null;
      await api('/api/saved-searches', {
        method: 'POST',
        body: {
          name: name.trim(),
          skills,
          countryCodes: country ? [country] : [],
          cities: params.get('city') ? [params.get('city')!.trim()] : [],
          workMode,
          minMatchScore: null,
        },
      });
      window.alert("Search loop saved. Net-new matches will appear in Today's Shortlist on Home.");
    } catch {
      window.alert('Could not save search loop.');
    } finally {
      setSavingLoop(false);
    }
  };
  const [filtersOpen, setFiltersOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 761px)').matches : true,
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [peekJob, setPeekJob] = useState<JobSummary | null>(null);

  const handleSyncTargets = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await api<{ addedCount: number }>('/api/sources/sync-targets', { method: 'POST' });
      setSyncMessage(
        res.addedCount > 0
          ? `Syncing target markets (${res.addedCount} new board${res.addedCount === 1 ? '' : 's'} added).`
          : 'All target market boards are actively monitored and up to date.',
      );
      setReload((r) => r + 1);
    } catch {
      setSyncMessage('Target market sync failed. Check that the service is running.');
    } finally {
      setSyncing(false);
    }
  };

  const countryOptions: readonly (readonly [string, string])[] = useMemo(() => {
    const counts = list.state === 'ready' ? (list.data.countryCounts ?? {}) : {};
    return [
      ['', `All markets${list.state === 'ready' ? ` (${list.data.total})` : ''}`],
      ...COUNTRY_CODES.map((code) => {
        const name = COUNTRY_REGISTRY[code]?.name ?? code;
        const count = counts[code];
        const label = count !== undefined ? `${name} (${count})` : name;
        return [code, label] as const;
      }),
    ];
  }, [list]);

  const selectedSkills = useMemo(
    () =>
      params
        .get('skills')
        ?.split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean) ?? [],
    [search],
  );
  const skillMode = (params.get('skillMode') as 'any' | 'all') || 'any';
  const excludedSkills = useMemo(
    () =>
      params
        .get('excludeSkills')
        ?.split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean) ?? [],
    [search],
  );

  const activeFilters =
    (Object.keys(FILTERS) as FilterKey[]).filter((k) => params.get(k)).length +
    (params.get('city') ? 1 : 0) +
    (params.get('skills') ? 1 : 0) +
    (params.get('excludeSkills') ? 1 : 0) +
    (params.get('includeExcludedEmployers') ? 1 : 0) +
    (params.get('immediateStart') ? 1 : 0);

  useEffect(() => searchForm.reset({ q: new URLSearchParams(search).get('q') ?? '' }), [search, searchForm]);

  useEffect(() => {
    let cancelled = false;
    const p = new URLSearchParams(search);
    p.set('limit', String(limit));
    for (const [k, v] of [...p.entries()]) if (v === '') p.delete(k);
    setList((l) => (l.state === 'ready' ? l : { state: 'loading' }));
    api<JobList>(`/api/jobs?${p.toString()}`).then(
      (data) => !cancelled && setList({ state: 'ready', data }),
      () => !cancelled && setList({ state: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [search, limit, reload]);

  const update = (key: string, value: string): void => {
    const p = new URLSearchParams(search);
    if (key === 'country') p.delete('city');
    if (value) p.set(key, value);
    else p.delete(key);
    setLimit(PAGE);
    navigate(`/opportunities${p.toString() ? `?${p.toString()}` : ''}`, { replace: true });
  };

  const handleSkillsChange = (skills: string[], mode?: 'any' | 'all', excluded?: string[]) => {
    const p = new URLSearchParams(search);
    if (skills.length > 0) p.set('skills', skills.join(','));
    else p.delete('skills');

    if (mode && mode !== 'any') p.set('skillMode', mode);
    else p.delete('skillMode');

    if (excluded && excluded.length > 0) p.set('excludeSkills', excluded.join(','));
    else p.delete('excludeSkills');

    setLimit(PAGE);
    navigate(`/opportunities${p.toString() ? `?${p.toString()}` : ''}`, { replace: true });
  };

  const submitQuery = searchForm.handleSubmit(({ q }) => update('q', q.trim()));

  const handleDisposition = (jobId: string, disposition: Disposition): void => {
    setList((l) =>
      l.state === 'ready'
        ? {
            state: 'ready',
            data: {
              ...l.data,
              jobs: l.data.jobs.map((j) => (j.id === jobId ? { ...j, disposition } : j)),
            },
          }
        : l,
    );
  };

  const toggleCompare = (id: string): void => {
    setCompare((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : curr.length < MAX_COMPARE ? [...curr, id] : curr,
    );
  };

  const countries =
    settings.state === 'ready' ? configuredCountries(settings.data.settings['search.preferredCountries']) : [];
  const selectedCountry = params.get('country') ?? '';
  const filtered = activeFilters > 0 || Boolean(params.get('q'));

  return (
    <div>
      <PageHeader
        eyebrow="Market discovery"
        title="Opportunities"
        lede="Roles found on employer job boards, matched against your verified experience."
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSyncTargets()}
              disabled={syncing}
              className="text-xs"
            >
              {syncing ? 'Syncing…' : '⚡ Auto-sync markets'}
            </Button>
            <Link
              href="/opportunities/new"
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'text-xs')}
            >
              Add a job
            </Link>
            <Link
              href="/opportunities/sources"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs')}
            >
              Job boards
            </Link>
          </div>
        }
      />

      {syncMessage && (
        <div
          className="my-3 p-3 rounded-lg border border-teal-500/30 bg-teal-50 dark:bg-teal-950/20 text-teal-900 dark:text-teal-200 text-xs shadow-xs"
          role="status"
        >
          {syncMessage}
        </div>
      )}

      <details className="my-4 rounded-lg border border-border bg-card shadow-xs">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-foreground select-none">
          Market focus &amp; official searches
        </summary>
        <div className="px-4 pb-4">
          <CountryFocusViews countries={countries} />
        </div>
      </details>

      <div className="flex items-center justify-between border-b border-border my-4 pb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Opportunity discovery modes">
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'all'}
            onClick={() => setViewTab('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewTab === 'all'
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            All Opportunities {list.state === 'ready' ? `(${list.data.total})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'collections'}
            onClick={() => setViewTab('collections')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewTab === 'collections'
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            Curated Collections
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'shortlist'}
            onClick={() => setViewTab('shortlist')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewTab === 'shortlist'
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            Decision Shortlists (6D)
          </button>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => void saveCurrentFilterAsLoop()}
            disabled={savingLoop}
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Save the current filters as a loop for Today's Shortlist"
          >
            {savingLoop ? 'Saving…' : 'Save filter as loop'}
          </button>
        </div>
      </div>

      {viewTab === 'collections' && <CollectionsHub />}
      {viewTab === 'shortlist' && <DecisionShortlistHub />}
      {viewTab === 'all' && (
        <>
          <form
            className="my-4 flex gap-2 max-w-xl"
            role="search"
            onSubmit={submitQuery}
            aria-label="Search and filter opportunities"
          >
            <label htmlFor="q" className="sr-only">
              Search title, employer or description
            </label>
            <Input
              id="q"
              type="search"
              placeholder="Search title, employer or description"
              aria-label="Search title, employer or description"
              className="flex-1"
              {...searchForm.register('q')}
            />
            <Button type="submit" size="sm">
              Search
            </Button>
          </form>

          <SkillFilterBar
            selectedSkills={selectedSkills}
            skillMode={skillMode}
            excludedSkills={excludedSkills}
            onSkillsChange={handleSkillsChange}
            countryFilter={params.get('country') ?? undefined}
            remoteFilter={params.get('remote') ?? undefined}
            queryFilter={params.get('q') ?? undefined}
          />

          <div className="my-4 p-4 rounded-lg border border-border bg-card shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={filtersOpen}
                aria-controls="filters-content"
                onClick={() => setFiltersOpen((o) => !o)}
                className="text-xs"
              >
                {filtersOpen ? 'Hide filters' : `Filters${activeFilters > 0 ? ` (${activeFilters})` : ''}`}
              </Button>
              {filtered && (
                <Link href="/opportunities" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs')}>
                  Reset all
                </Link>
              )}
            </div>

            {filtersOpen && (
              <div
                id="filters-content"
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border"
              >
                {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
                  <div key={k} className="space-y-1">
                    <label htmlFor={`filter-${k}`} className="text-xs font-medium text-muted-foreground block">
                      {filterLabel(k)}
                    </label>
                    {(() => {
                      const options: readonly (readonly [string, string])[] =
                        k === 'country' ? countryOptions : FILTERS[k];
                      return (
                        <select
                          id={`filter-${k}`}
                          value={params.get(k) ?? ''}
                          onChange={(e) => update(k, e.target.value)}
                          className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs shadow-xs"
                        >
                          {options.map(([v, label]) => (
                            <option key={v} value={v}>
                              {label}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                ))}
                {params.get('country') &&
                  params.get('country')! in COUNTRY_REGISTRY &&
                  COUNTRY_REGISTRY[params.get('country') as keyof typeof COUNTRY_REGISTRY].defaultCities.length > 0 && (
                    <div className="space-y-1">
                      <label htmlFor="filter-city" className="text-xs font-medium text-muted-foreground block">
                        City
                      </label>
                      <select
                        id="filter-city"
                        value={params.get('city') ?? ''}
                        onChange={(e) => update('city', e.target.value)}
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs shadow-xs"
                      >
                        <option value="">All cities</option>
                        {COUNTRY_REGISTRY[params.get('country') as keyof typeof COUNTRY_REGISTRY].defaultCities.map(
                          (city) => (
                            <option key={city} value={city}>
                              {city}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  )}
                <div className="flex items-center gap-2 pt-4">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={params.get('immediateStart') === 'true'}
                      onChange={(e) => update('immediateStart', e.target.checked ? 'true' : '')}
                      className="accent-primary"
                    />
                    <span>Asks for an early start</span>
                  </label>
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={params.get('includeExcludedEmployers') === 'true'}
                      onChange={(e) => update('includeExcludedEmployers', e.target.checked ? 'true' : '')}
                      className="accent-primary"
                    />
                    <span>Show excluded employers</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {list.state === 'loading' && <Loading label="Loading opportunities" />}
          {list.state === 'error' && (
            <ErrorPanel message="Opportunities could not be loaded." onRetry={() => setReload((r) => r + 1)} />
          )}
          {list.state === 'ready' && (
            <>
              <TopMatchSpotlight jobs={list.data.jobs} />
              {list.data.jobs.length === 0 ? (
                <EmptyHint filtered={filtered} />
              ) : (
                <>
                  <p className="result-count text-xs text-muted-foreground my-2" role="status" aria-live="polite">
                    {list.data.total === 0
                      ? 'No opportunities match.'
                      : `${list.data.total} ${list.data.total === 1 ? 'opportunity' : 'opportunities'}`}
                  </p>
                  <ul className="job-list space-y-3 p-0 m-0 list-none" data-testid="job-list">
                    {list.data.jobs.map((job) => (
                      <JobRow
                        key={job.id}
                        job={job}
                        selected={compare.includes(job.id)}
                        compareFull={compare.length >= MAX_COMPARE}
                        filterSkillCount={selectedSkills.length}
                        onCompare={() => toggleCompare(job.id)}
                        onDisposition={(d) => void handleDisposition(job.id, d)}
                        onPeek={(j) => setPeekJob(j)}
                        autopilotSelected={autopilotQueue.includes(job.id)}
                        onAutopilotToggle={() => toggleAutopilot(job.id)}
                      />
                    ))}
                  </ul>
                  {list.data.jobs.length < list.data.total && (
                    <div className="my-6 text-center">
                      <Button type="button" variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                        Load more opportunities
                      </Button>
                    </div>
                  )}
                </>
              )}
              {compare.length > 0 && (
                <div
                  className="compare-bar fixed bottom-4 right-4 z-40 p-4 bg-card border border-border rounded-xl shadow-lg flex items-center gap-4"
                  role="region"
                  aria-label="Comparison"
                >
                  <span className="text-xs font-semibold text-foreground">
                    {compare.length} of {MAX_COMPARE} selected for comparison
                  </span>
                  <div className="flex gap-2">
                    <Link
                      href={`/opportunities/compare?ids=${compare.join(',')}`}
                      className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'text-xs')}
                      aria-disabled={compare.length < 2}
                    >
                      Compare {compare.length < 2 ? '(pick at least 2)' : 'now'}
                    </Link>
                    <button
                      type="button"
                      className="quiet text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={() => setCompare([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
              {autopilotQueue.length > 0 &&
                (() => {
                  const selectedJobs =
                    list.state === 'ready' ? list.data.jobs.filter((j) => autopilotQueue.includes(j.id)) : [];
                  const companyCounts = new Map<string, number>();
                  for (const j of selectedJobs) {
                    companyCounts.set(j.employer, (companyCounts.get(j.employer) ?? 0) + 1);
                  }
                  const duplicateCompanies = Array.from(companyCounts.entries()).filter(([_, count]) => count > 1);

                  return (
                    <div
                      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 p-4 bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 max-w-2xl w-[calc(100%-2rem)] mx-auto animate-in slide-in-from-bottom-3 duration-200"
                      role="region"
                      aria-label="Autopilot Queue Selection"
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-xs font-semibold text-foreground">
                            Queue {autopilotQueue.length} selected · {focusCapRemaining} focus slots left
                          </span>
                        </div>
                        {duplicateCompanies.length > 0 && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 m-0 leading-tight">
                            ⚠️ Note: Multiple roles selected at {duplicateCompanies.map(([c]) => c).join(', ')}. Career
                            Strike suggests 1 per company.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          disabled={batchQueueing || autopilotQueue.length > focusCapRemaining}
                          onClick={() => void handleQueueAutopilot()}
                          className="text-xs gap-1.5 shadow-xs"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Queue for Autopilot →</span>
                        </Button>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
                          onClick={() => setAutopilotQueue([])}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  );
                })()}
              {selectedCountry === 'JP' && (
                <OfficialSearches
                  id="jp-official"
                  market="Japan"
                  sources={JAPAN_SOURCE_ASSESSMENTS}
                  urlFor={officialJapanSearchUrl}
                  query={activeQuery}
                />
              )}
              {selectedCountry === 'SG' && (
                <OfficialSearches
                  id="sg-official"
                  market="Singapore"
                  sources={SINGAPORE_SOURCE_ASSESSMENTS}
                  urlFor={officialSingaporeSearchUrl}
                  query={activeQuery}
                />
              )}
              {selectedCountry === 'AE' && (
                <OfficialSearches
                  id="ae-official"
                  market="UAE"
                  sources={UAE_SOURCE_ASSESSMENTS}
                  urlFor={officialUaeSearchUrl}
                  query={activeQuery}
                />
              )}
              {selectedCountry === 'IN' && (
                <OfficialSearches
                  id="in-official"
                  market="India"
                  sources={INDIA_SOURCE_ASSESSMENTS}
                  urlFor={officialIndiaSearchUrl}
                  query={activeQuery}
                />
              )}
              {selectedCountry === 'DE' && (
                <OfficialSearches
                  id="de-official"
                  market="Germany"
                  sources={GERMANY_SOURCE_ASSESSMENTS}
                  urlFor={officialGermanySearchUrl}
                  query={activeQuery}
                />
              )}
              {selectedCountry === 'GB' && (
                <OfficialSearches
                  id="gb-official"
                  market="United Kingdom"
                  sources={UK_SOURCE_ASSESSMENTS}
                  urlFor={officialUkSearchUrl}
                  query={activeQuery}
                />
              )}
              {selectedCountry === 'AU' && (
                <OfficialSearches
                  id="au-official"
                  market="Australia"
                  sources={AUSTRALIA_SOURCE_ASSESSMENTS}
                  urlFor={officialAustraliaSearchUrl}
                  query={activeQuery}
                />
              )}
              {selectedCountry === 'CA' && (
                <OfficialSearches
                  id="ca-official"
                  market="Canada"
                  sources={CANADA_SOURCE_ASSESSMENTS}
                  urlFor={officialCanadaSearchUrl}
                  query={activeQuery}
                />
              )}
            </>
          )}
        </>
      )}

      <OpportunityPeekDrawer
        job={peekJob}
        onClose={() => setPeekJob(null)}
        onDisposition={(id, d) => void handleDisposition(id, d)}
      />
    </div>
  );
}

function configuredCountries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((code): code is string => typeof code === 'string' && code in COUNTRY_REGISTRY))];
}

function filterLabel(key: FilterKey): string {
  return {
    status: 'Status',
    disposition: 'Your decision',
    remote: 'Arrangement',
    country: 'Market',
    source: 'Source',
    tier: 'Fit',
    sort: 'Sort',
  }[key];
}

function EmptyHint({ filtered }: { filtered: boolean }) {
  if (filtered)
    return (
      <p className="text-sm text-muted-foreground italic my-6 text-center">
        Try clearing a filter or searching for something broader.
      </p>
    );
  return (
    <p className="text-sm text-muted-foreground italic my-6 text-center">
      Nothing here yet.{' '}
      <Link href="/opportunities/sources" className="text-primary hover:underline">
        Monitor a job board
      </Link>{' '}
      or{' '}
      <Link href="/opportunities/new" className="text-primary hover:underline">
        add a job you found
      </Link>
      .
    </p>
  );
}

export default Opportunities;
