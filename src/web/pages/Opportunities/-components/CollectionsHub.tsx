import { useCallback, useEffect, useState } from 'react';
import {
  type CuratedCollectionDetail,
  type CuratedCollectionSummary,
  createCustomCollection,
  fetchCollectionDetail,
  fetchCollections,
} from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { useToast } from '../../../components/ui/toast';
import { Link } from '../../../router';

export function CollectionsHub() {
  const { toast } = useToast();
  const [collections, setCollections] = useState<CuratedCollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<CuratedCollectionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Custom collection modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [keyword, setKeyword] = useState('');
  const [badge, setBadge] = useState('CUSTOM');
  const [saving, setSaving] = useState(false);

  const loadCollections = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchCollections();
      setCollections(res.collections);
    } catch {
      toast({ variant: 'destructive', title: 'Could not load curated collections' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  const selectCollection = async (slug: string) => {
    if (activeSlug === slug) {
      setActiveSlug(null);
      setDetail(null);
      return;
    }
    setActiveSlug(slug);
    setLoadingDetail(true);
    try {
      const res = await fetchCollectionDetail(slug);
      setDetail(res.collection);
    } catch {
      setDetail(null);
      toast({ variant: 'destructive', title: 'Could not load collection details' });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    try {
      await createCustomCollection({
        title: title.trim(),
        description: description.trim(),
        badge: badge.trim() || 'CUSTOM',
        filter: { keyword: keyword.trim() },
      });
      setShowCreateModal(false);
      setTitle('');
      setDescription('');
      setKeyword('');
      toast({ variant: 'success', title: 'Collection created' });
      void loadCollections();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not create collection',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="collections-hub-title" className="space-y-4 my-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 id="collections-hub-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
            Curated Career Collections
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Explainable, rule-based company and opportunity collections benchmarked on genuine market signals—never
            arbitrary top-100 lists.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowCreateModal(true)} className="text-xs">
          + New Personal Collection
        </Button>
      </div>

      {loading && <p className="text-xs text-muted-foreground py-4 text-center">Loading collections...</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {collections.map((col) => {
          const isSelected = activeSlug === col.slug;
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => void selectCollection(col.slug)}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5 shadow-xs'
                  : 'border-border bg-card hover:border-border/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <Badge variant={isSelected ? 'default' : 'secondary'} className="text-[10px] font-mono">
                  {col.badge}
                </Badge>
                {col.isCustom && <span className="text-[10px] font-medium text-primary">Personal</span>}
              </div>
              <strong className="text-sm font-semibold text-foreground block truncate">{col.title}</strong>
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed m-0">
                {col.description}
              </p>
              <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{col.matchingCompaniesCount} companies</span>
                <span className="font-semibold text-foreground">{col.activeOpenRolesCount} open roles</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Collection Drilldown */}
      {activeSlug && (
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-4">
          {loadingDetail && (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading collection details...</p>
          )}

          {detail && !loadingDetail && (
            <div className="space-y-4">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-semibold text-foreground m-0">{detail.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{detail.description}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setActiveSlug(null)} className="text-xs">
                  Close view
                </Button>
              </div>

              {/* Matching Companies */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                  Included Companies ({detail.matchingCompanies.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {detail.matchingCompanies.map((c) => (
                    <div
                      key={c.id}
                      className="px-2.5 py-1 rounded-md border border-border bg-muted/30 text-xs flex items-center gap-2"
                    >
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground">({c.stage.replaceAll('_', ' ')})</span>
                      {c.openRoles > 0 && (
                        <Badge variant="teal" className="text-[9px] px-1 py-0">
                          {c.openRoles} open
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Roles in this Collection */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                  Active Verified Roles ({detail.activeRoles.length})
                </span>
                {detail.activeRoles.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No verified open roles currently observed for this collection.
                  </p>
                ) : (
                  <ul className="space-y-2 list-none p-0 m-0">
                    {detail.activeRoles.slice(0, 10).map((role) => (
                      <li
                        key={role.id}
                        className="p-3 rounded-lg border border-border/80 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <Link href={`/jobs/${role.id}`} className="font-semibold text-foreground hover:underline">
                            {role.title}
                          </Link>
                          <span className="text-muted-foreground ml-2">
                            {role.employer} • {role.locationText ?? 'Remote'}
                          </span>
                        </div>
                        <Link
                          href={`/jobs/${role.id}`}
                          className="shrink-0 text-primary font-medium hover:underline text-xs"
                        >
                          View role →
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Custom Collection Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-serif">Create Personal Collection</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Define your own criteria to group target opportunities and companies dynamically.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCustom} className="space-y-3 pt-2">
            <div className="space-y-1">
              <label htmlFor="custom-col-title" className="text-xs font-medium text-foreground block">
                Collection Title
              </label>
              <Input
                id="custom-col-title"
                placeholder="e.g. High-Impact Climate Tech"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="custom-col-desc" className="text-xs font-medium text-foreground block">
                Selection Explanation
              </label>
              <Textarea
                id="custom-col-desc"
                placeholder="Why these companies fit your career goals..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                required
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor="custom-col-keyword" className="text-xs font-medium text-foreground block">
                  Keyword Filter
                </label>
                <Input
                  id="custom-col-keyword"
                  placeholder="e.g. climate, energy, carbon"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="custom-col-badge" className="text-xs font-medium text-foreground block">
                  Badge Label
                </label>
                <Input
                  id="custom-col-badge"
                  placeholder="e.g. CLIMATE"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value.toUpperCase())}
                  maxLength={12}
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || !title.trim() || !description.trim()}>
                {saving ? 'Creating...' : 'Save Collection'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
