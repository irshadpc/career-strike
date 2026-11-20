import { useState } from 'react';
import { api } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import type { MasterBullet, MasterEntry } from '../-schema/studio-types';

export function VaultOutliner({
  entries,
  selectedBulletId,
  includedEntryIds,
  includedBulletIds,
  onSelectBullet,
  onToggleEntry,
  onToggleBullet,
  onRefresh,
}: {
  entries: MasterEntry[];
  selectedBulletId: string | null;
  includedEntryIds: Set<string>;
  includedBulletIds: Set<string>;
  onSelectBullet: (bullet: MasterBullet, entry: MasterEntry) => void;
  onToggleEntry: (entryId: string) => void;
  onToggleBullet: (bulletId: string) => void;
  onRefresh: () => void;
}) {
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntryType, setNewEntryType] = useState<'experience' | 'project' | 'education' | 'certification'>(
    'experience',
  );
  const [newOrg, setNewOrg] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newIsCurrent, setNewIsCurrent] = useState(false);
  const [addingBulletForEntryId, setAddingBulletForEntryId] = useState<string | null>(null);
  const [newBulletText, setNewBulletText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrg.trim() || !newTitle.trim()) return;
    setSubmitting(true);
    try {
      await api('/api/studio/master/entries', {
        method: 'POST',
        body: {
          entryType: newEntryType,
          organization: newOrg.trim(),
          title: newTitle.trim(),
          location: newLocation.trim() || null,
          startDate: newStartDate.trim() || null,
          endDate: newEndDate.trim() || null,
          isCurrent: newIsCurrent,
        },
      });
      setNewOrg('');
      setNewTitle('');
      setNewLocation('');
      setNewStartDate('');
      setNewEndDate('');
      setShowAddEntry(false);
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddBullet = async (entryId: string) => {
    if (!newBulletText.trim()) return;
    setSubmitting(true);
    try {
      await api(`/api/studio/master/entries/${encodeURIComponent(entryId)}/bullets`, {
        method: 'POST',
        body: { rawText: newBulletText.trim() },
      });
      setNewBulletText('');
      setAddingBulletForEntryId(null);
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!window.confirm('Delete this entry from your master career vault?')) return;
    try {
      await api(`/api/studio/master/entries/${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
      });
      onRefresh();
    } catch {
      // silent
    }
  };

  const handleDeleteBullet = async (bulletId: string) => {
    try {
      await api(`/api/studio/master/bullets/${encodeURIComponent(bulletId)}`, {
        method: 'DELETE',
      });
      onRefresh();
    } catch {
      // silent
    }
  };

  const sections: { key: MasterEntry['entryType']; label: string }[] = [
    { key: 'experience', label: 'Work Experience' },
    { key: 'project', label: 'Key Projects' },
    { key: 'education', label: 'Education' },
    { key: 'certification', label: 'Certifications' },
  ];

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div>
          <span className="font-semibold text-foreground text-sm">Master Vault Outliner</span>
          <p className="text-muted-foreground text-[11px]">
            Check/uncheck entries or individual bullets to compose variants.
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setShowAddEntry(!showAddEntry)}>
          {showAddEntry ? 'Cancel' : '+ Add Entry'}
        </Button>
      </div>

      {showAddEntry && (
        <form onSubmit={handleCreateEntry} className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="new-entry-type" className="block text-[11px] font-medium text-foreground mb-1">
                Section
              </label>
              <select
                id="new-entry-type"
                value={newEntryType}
                onChange={(e) => setNewEntryType(e.target.value as MasterEntry['entryType'])}
                className="w-full text-xs rounded border border-input bg-background p-1.5"
              >
                <option value="experience">Experience</option>
                <option value="project">Project</option>
                <option value="education">Education</option>
                <option value="certification">Certification</option>
              </select>
            </div>
            <div>
              <label htmlFor="new-entry-org" className="block text-[11px] font-medium text-foreground mb-1">
                Organization / Employer
              </label>
              <Input
                id="new-entry-org"
                value={newOrg}
                onChange={(e) => setNewOrg(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="h-7 text-xs"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="new-entry-title" className="block text-[11px] font-medium text-foreground mb-1">
                Title / Degree
              </label>
              <Input
                id="new-entry-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                className="h-7 text-xs"
                required
              />
            </div>
            <div>
              <label htmlFor="new-entry-location" className="block text-[11px] font-medium text-foreground mb-1">
                Location
              </label>
              <Input
                id="new-entry-location"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="e.g. San Francisco, CA"
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="flex gap-2 items-center pt-1">
            <Input
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              placeholder="Start (e.g. 2021)"
              className="h-7 text-xs w-28"
            />
            <Input
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              placeholder="End (e.g. 2024)"
              disabled={newIsCurrent}
              className="h-7 text-xs w-28"
            />
            <label className="flex items-center gap-1 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={newIsCurrent}
                onChange={(e) => setNewIsCurrent(e.target.checked)}
                className="rounded"
              />
              Present
            </label>
            <div className="ml-auto">
              <Button type="submit" size="sm" disabled={submitting}>
                Save
              </Button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
        {sections.map(({ key, label }) => {
          const sectionEntries = entries.filter((e) => e.entryType === key);
          if (sectionEntries.length === 0) return null;
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                <span>{label}</span>
                <span className="text-[9px] bg-muted px-1.5 py-0.2 rounded-full">{sectionEntries.length}</span>
              </div>
              <div className="space-y-2">
                {sectionEntries.map((entry) => {
                  const isEntryIncluded = includedEntryIds.has(entry.id);
                  return (
                    <div
                      key={entry.id}
                      className={`p-2.5 rounded-lg border transition-colors ${
                        isEntryIncluded ? 'border-border bg-card' : 'border-border/40 bg-muted/20 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={isEntryIncluded}
                            onChange={() => onToggleEntry(entry.id)}
                            className="mt-0.5 rounded text-primary focus:ring-primary cursor-pointer"
                            aria-label={`Include ${entry.title} in variant`}
                          />
                          <div>
                            <span className="font-semibold text-foreground text-xs block">{entry.title}</span>
                            <span className="text-muted-foreground text-[11px]">
                              {entry.organization}
                              {entry.location ? ` · ${entry.location}` : ''}
                              {entry.startDate
                                ? ` (${entry.startDate} - ${entry.isCurrent ? 'Present' : (entry.endDate ?? '')})`
                                : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setAddingBulletForEntryId(addingBulletForEntryId === entry.id ? null : entry.id)
                            }
                            className="text-[10px] text-primary hover:underline px-1 py-0.5"
                          >
                            + Bullet
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteEntry(entry.id)}
                            className="text-[10px] text-muted-foreground hover:text-destructive px-1 py-0.5"
                            title="Delete entry"
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      {/* Add bullet inline */}
                      {addingBulletForEntryId === entry.id && (
                        <div className="mt-2 pl-5 flex gap-1.5">
                          <Input
                            value={newBulletText}
                            onChange={(e) => setNewBulletText(e.target.value)}
                            placeholder="Accomplished [X] as measured by [Y] by doing [Z]..."
                            className="h-7 text-xs flex-1"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleAddBullet(entry.id);
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={submitting || !newBulletText.trim()}
                            onClick={() => void handleAddBullet(entry.id)}
                          >
                            Add
                          </Button>
                        </div>
                      )}

                      {/* Bullets List */}
                      {entry.bullets && entry.bullets.length > 0 && (
                        <ul className="mt-2 pl-4 space-y-1.5 border-l-2 border-border/60 ml-2">
                          {entry.bullets.map((bullet) => {
                            const isBulletIncluded = includedBulletIds.has(bullet.id);
                            const isSelected = selectedBulletId === bullet.id;
                            return (
                              <li
                                key={bullet.id}
                                className={`group flex items-start gap-1.5 p-1 rounded text-[11px] transition-colors cursor-pointer ${
                                  isSelected ? 'bg-accent/15 border border-primary/40' : 'hover:bg-muted/40'
                                }`}
                                onClick={() => onSelectBullet(bullet, entry)}
                              >
                                <input
                                  type="checkbox"
                                  checked={isBulletIncluded}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    onToggleBullet(bullet.id);
                                  }}
                                  className="mt-0.5 rounded text-primary focus:ring-primary cursor-pointer"
                                  aria-label="Include bullet"
                                />
                                <span
                                  className={`flex-1 leading-snug ${!isBulletIncluded ? 'line-through opacity-50' : ''}`}
                                >
                                  {bullet.rawText}
                                </span>
                                {bullet.xyzScore > 0 && (
                                  <Badge
                                    variant={bullet.xyzScore >= 70 ? 'teal' : 'outline'}
                                    className="text-[9px] px-1 py-0 shrink-0 self-center"
                                  >
                                    XYZ {bullet.xyzScore}
                                  </Badge>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDeleteBullet(bullet.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-[10px] px-1"
                                  title="Delete bullet"
                                >
                                  ×
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
