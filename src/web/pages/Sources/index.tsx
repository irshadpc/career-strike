import { useCallback, useEffect, useState } from 'react';
import { api, type SourceBoard, type Task } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Button } from '../../components/ui/button';
import { useToast } from '../../components/ui/toast';
import { Link } from '../../router';
import { AddBoardForm } from './-components/AddBoardForm';
import { BoardRow } from './-components/BoardRow';

export function Sources() {
  const { toast } = useToast();
  const [boards, setBoards] = useState<SourceBoard[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [syncingTargets, setSyncingTargets] = useState(false);
  const [tasks, setTasks] = useState<Record<string, Task>>({});

  const load = useCallback(async () => {
    try {
      const res = await api<{ boards: SourceBoard[] }>('/api/sources');
      setBoards(res.boards);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const active = Object.values(tasks).filter((t) => t.state === 'RUNNING' || t.state === 'QUEUED');
  const _activeKey = active.map((t) => t.id).join(',');
  useEffect(() => {
    if (active.length === 0) return;
    const timer = window.setInterval(async () => {
      const updates = await Promise.all(
        active.map((t) =>
          api<{ task: Task }>(`/api/tasks/${t.id}`)
            .then((r) => r.task)
            .catch(() => t),
        ),
      );
      setTasks((prev) => ({ ...prev, ...Object.fromEntries(updates.map((t) => [t.id, t])) }));
      if (updates.some((t) => t.state !== 'RUNNING' && t.state !== 'QUEUED')) void load();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active.length, active.map, load]);

  const track = (task: Task | null): void => {
    if (task) setTasks((prev) => ({ ...prev, [task.id]: task }));
  };

  const taskFor = (board: SourceBoard): Task | undefined =>
    Object.values(tasks).find((t) => t.kind === `discover:${board.id}`);

  const syncMarketBoards = async () => {
    setSyncingTargets(true);
    try {
      const res = await api<{ addedCount: number }>('/api/sources/sync-targets', { method: 'POST' });
      toast({
        variant: 'success',
        title: `Synced ${res.addedCount} target board(s)`,
        description: 'Run Fetch now on any board to discover open roles.',
      });
      void load();
    } catch {
      toast({ variant: 'destructive', title: 'Could not sync market boards' });
    } finally {
      setSyncingTargets(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <span>
            <Link href="/opportunities">Opportunities</Link> / Job boards
          </span>
        }
        title="Job boards you monitor"
        lede="Career Strike reads public job boards hosted on Greenhouse, Lever and Ashby directly from each company’s official listing. Nothing is sent about you."
      />

      <AddBoardForm
        onAdded={(task) => {
          track(task);
          void load();
        }}
      />

      {loadError && <ErrorPanel message="Job boards could not be loaded." onRetry={() => void load()} />}
      {!boards && !loadError && <Loading label="Loading job boards" />}
      {boards && boards.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center space-y-3 my-4">
          <p className="text-sm text-muted-foreground m-0">
            No job boards yet. Add a company board above, or import curated boards from your{' '}
            <Link href="/markets" className="text-primary hover:underline">
              target markets
            </Link>
            .
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={syncingTargets}
            onClick={() => void syncMarketBoards()}
          >
            {syncingTargets ? 'Syncing Market Boards…' : 'Sync Market Boards'}
          </Button>
        </div>
      )}
      {boards && boards.length > 0 && (
        <ul className="space-y-3" data-testid="board-list">
          {boards.map((b) => (
            <BoardRow key={b.id} board={b} task={taskFor(b)} onTask={track} onRemoved={() => void load()} />
          ))}
        </ul>
      )}
    </>
  );
}

export default Sources;
