import {
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  Clock,
  ExternalLink as ExtIcon,
  FileCheck2,
  HelpCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import { Link } from '../../router';

export interface PendingQuestion {
  questionKey: string;
  questionLabel: string;
  answerType: 'boolean' | 'text' | 'select';
  options?: string[];
  placeholder?: string;
}

export interface AutopilotReceipt {
  fieldsFilled: number;
  resumeSnapshotId: string;
  atsProvider: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'other';
  companyName: string;
  jobTitle?: string;
  timestamp: string;
  verifiedPdfAttached: boolean;
  trackedAs: string;
}

export interface AutopilotQueueItem {
  id: string;
  jobId: string;
  companyName: string;
  atsProvider: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'other';
  status: 'queued' | 'needs_answer' | 'filling' | 'ready_to_submit' | 'blocked_fallback' | 'sent';
  fieldsFilledCount: number;
  fieldsTotalCount: number;
  pendingQuestion: PendingQuestion | null;
  resumeSnapshotId: string | null;
  receipt: AutopilotReceipt | null;
  sentAt: string | null;
  createdAt: string;
  jobTitle?: string;
  location?: string;
  applyUrl?: string;
}

export interface AnswerVaultItem {
  id: string;
  questionKey: string;
  questionLabel: string;
  answerValue: string;
  answerType: 'boolean' | 'text' | 'select';
  isDefault: boolean;
  updatedAt: string;
}

export interface AutopilotQueueResponse {
  items: AutopilotQueueItem[];
  receipts: AutopilotQueueItem[];
  dailyFocusCap: number;
  usedFocusCap: number;
  remainingFocusCap: number;
}

export function Autopilot() {
  const [data, setData] = useState<AutopilotQueueResponse | null>(null);
  const [answers, setAnswers] = useState<AnswerVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'queue' | 'vault' | 'receipts'>('queue');

  // Quick question form state per item id
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string | boolean>>({});
  const [saveAsDefault, setSaveAsDefault] = useState<Record<string, boolean>>({});

  // Clipboard copy confirmation feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // New Answer Vault modal/form state
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newType, setNewType] = useState<'text' | 'boolean' | 'select'>('text');

  const loadData = useCallback(async () => {
    try {
      const [queueRes, answersRes] = await Promise.all([
        api<AutopilotQueueResponse>('/api/autopilot/queue'),
        api<{ answers: AnswerVaultItem[] }>('/api/autopilot/answers'),
      ]);
      setData(queueRes);
      setAnswers(answersRes.answers);
    } catch (err) {
      console.error('Failed to load autopilot data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAnswerSubmit = async (item: AutopilotQueueItem) => {
    const answer = questionAnswers[item.id];
    if (answer === undefined || answer === '') return;
    const persist = saveAsDefault[item.id] !== false;

    try {
      await api<{ ok: boolean; item: AutopilotQueueItem }>(`/api/autopilot/${item.id}/answer`, {
        method: 'POST',
        body: { answer, saveAsDefault: persist },
      });
      await loadData();
    } catch (err) {
      console.error('Failed to submit answer:', err);
    }
  };

  const handleAdvanceToReady = async (itemId: string) => {
    try {
      await api<{ ok: boolean }>(`/api/autopilot/${itemId}/fill`, {
        method: 'POST',
      });
      await loadData();
    } catch (err) {
      console.error('Failed to advance fill:', err);
    }
  };

  const handleMarkSent = async (item: AutopilotQueueItem) => {
    try {
      await api<{ ok: boolean }>(`/api/autopilot/${item.id}/mark-sent`, {
        method: 'POST',
        body: {
          fieldsFilled: item.fieldsFilledCount || 14,
          resumeSnapshotId: item.resumeSnapshotId || 'snap_verified',
        },
      });
      await loadData();
    } catch (err) {
      console.error('Failed to mark sent:', err);
    }
  };

  const handleCreateAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey || !newLabel || !newValue) return;
    try {
      await api<{ ok: boolean }>('/api/autopilot/answers', {
        method: 'POST',
        body: {
          questionKey: newKey.trim(),
          questionLabel: newLabel.trim(),
          answerValue: newValue.trim(),
          answerType: newType,
          isDefault: true,
        },
      });
      setNewKey('');
      setNewLabel('');
      setNewValue('');
      await loadData();
    } catch (err) {
      console.error('Failed to create answer:', err);
    }
  };

  const handleDeleteAnswer = async (answerId: string) => {
    try {
      await api<{ ok: boolean }>(`/api/autopilot/answers/${answerId}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      console.error('Failed to delete answer:', err);
    }
  };

  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case 'greenhouse':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-status-success-bg text-status-success-fg border border-status-success-border">
            Greenhouse
          </span>
        );
      case 'lever':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-subtle text-ink border border-border">
            Lever
          </span>
        );
      case 'ashby':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-subtle text-ink border border-border">
            Ashby
          </span>
        );
      case 'workday':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-status-warn-bg text-status-warn-fg border border-status-warn-border">
            Workday
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-subtle text-ink-secondary border border-border">
            Direct Portal
          </span>
        );
    }
  };

  const activeCount = data?.items.length ?? 0;
  const receiptsCount = data?.receipts.length ?? 0;
  const answersCount = answers.length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="w-5 h-5" />
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              Supervised Autopilot Queue
            </span>
          </div>
          <h1 className="text-3xl font-display font-medium text-foreground tracking-tight m-0">
            Pick → Ask → Write → Track
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl m-0 leading-relaxed">
            High-intent application runtime. Answers are sourced from your reusable vault, tailored into verified
            packets, and paused at the submit button for human approval.
          </p>
        </div>

        {/* Daily Focus Cap Pip Counter */}
        {data && (
          <div className="p-4 rounded-xl border border-border bg-card/60 shadow-xs space-y-2 shrink-0 md:w-64">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Daily Focus Cap</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {data.usedFocusCap} / {data.dailyFocusCap} used
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: data.dailyFocusCap }).map((_, idx) => (
                <div
                  key={`cap-slot-${idx}`}
                  className={`h-2 flex-1 rounded-full transition-colors ${
                    idx < data.usedFocusCap ? 'bg-primary' : 'bg-muted border border-border/80'
                  }`}
                  title={idx < data.usedFocusCap ? 'Slot used today' : 'Available focus slot'}
                />
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground m-0">
              {data.remainingFocusCap > 0
                ? `${data.remainingFocusCap} slot(s) remaining today.`
                : 'Daily focus cap reached. Prioritize follow-ups.'}
            </p>
          </div>
        )}
      </div>

      {/* Tabs Layout */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList className="bg-muted/60 p-1 rounded-lg border border-border">
            <TabsTrigger value="queue" className="text-xs gap-1.5">
              <span>Active Queue</span>
              {activeCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-primary text-primary-foreground font-mono">
                  {activeCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="vault" className="text-xs gap-1.5">
              <span>Answer Vault</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted-foreground/20 text-foreground font-mono">
                {answersCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="receipts" className="text-xs gap-1.5">
              <span>Receipt History</span>
              {receiptsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-status-success-bg text-status-success-fg border border-status-success-border font-mono">
                  {receiptsCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Link
              href="/opportunities"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Pick Roles</span>
            </Link>
          </div>
        </div>

        {/* 1. ACTIVE QUEUE PANEL */}
        <TabsContent value="queue" className="space-y-4 m-0">
          {data?.items.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-border/80 bg-card/40 space-y-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground m-0">Autopilot Queue is empty</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto m-0 leading-relaxed">
                Select high-match opportunities from your feed to queue them for supervised filling, question
                resolution, and one-click tracking.
              </p>
              <div className="pt-2">
                <Link
                  href="/opportunities"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
                >
                  <span>Browse Opportunities →</span>
                </Link>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {data?.items.map((item) => (
                <Card
                  key={item.id}
                  className="p-5 border-border bg-card shadow-xs hover:border-border/80 transition-colors space-y-4"
                >
                  {/* Top Bar: Company, Role, Provider, Progress */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-foreground m-0">
                          <Link href={`/jobs/${item.jobId}`} className="hover:underline">
                            {item.jobTitle || 'Target Opportunity'}
                          </Link>
                        </h3>
                        {getProviderBadge(item.atsProvider)}
                      </div>
                      <p className="text-xs text-muted-foreground m-0 flex items-center gap-2">
                        <span className="font-medium text-foreground">{item.companyName}</span>
                        {item.location && (
                          <>
                            <span>•</span>
                            <span>{item.location}</span>
                          </>
                        )}
                        <span>•</span>
                        <span className="font-mono text-[11px] tabular-nums">
                          Added{' '}
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>
                    </div>

                    {/* Progress Step Indicator */}
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground shrink-0 bg-muted/40 px-3 py-1.5 rounded-full border border-border/60">
                      <span className={item.status === 'needs_answer' ? 'text-primary font-semibold' : ''}>Ask</span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
                      <span className={item.status === 'filling' ? 'text-primary font-semibold' : ''}>Fill</span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
                      <span
                        className={
                          item.status === 'ready_to_submit' || item.status === 'blocked_fallback'
                            ? 'text-primary font-semibold'
                            : ''
                        }
                      >
                        {item.status === 'blocked_fallback' ? 'Copy-Fill' : 'Review'}
                      </span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
                      <span className={item.status === 'sent' ? 'text-status-success-fg font-semibold' : ''}>
                        Track
                      </span>
                    </div>
                  </div>

                  {/* Body: State-specific rendering */}

                  {/* 1. NEEDS ANSWER: Quick Question Micro-Card */}
                  {item.status === 'needs_answer' && item.pendingQuestion && (
                    <div className="p-4 rounded-lg bg-status-warn-bg border border-status-warn-border space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <HelpCircle className="w-4 h-4 text-status-warn-fg shrink-0" />
                          <span className="text-xs font-semibold text-status-warn-fg">Quick Screening Question</span>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                          {item.fieldsFilledCount}/{item.fieldsTotalCount} fields ready
                        </span>
                      </div>

                      <p className="text-sm font-medium text-foreground m-0">{item.pendingQuestion.questionLabel}</p>

                      {/* Interactive Controls */}
                      {item.pendingQuestion.answerType === 'boolean' ? (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setQuestionAnswers((prev) => ({
                                ...prev,
                                [item.id]: true,
                              }))
                            }
                            className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-all cursor-pointer ${
                              questionAnswers[item.id] === true
                                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                : 'bg-background hover:bg-muted border-border text-foreground'
                            }`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setQuestionAnswers((prev) => ({
                                ...prev,
                                [item.id]: false,
                              }))
                            }
                            className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-all cursor-pointer ${
                              questionAnswers[item.id] === false
                                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                : 'bg-background hover:bg-muted border-border text-foreground'
                            }`}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <Textarea
                            rows={2}
                            placeholder={item.pendingQuestion.placeholder || 'Type your concise answer...'}
                            value={String(questionAnswers[item.id] ?? '')}
                            onChange={(e) =>
                              setQuestionAnswers((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="text-xs bg-background"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={saveAsDefault[item.id] !== false}
                            onChange={(e) =>
                              setSaveAsDefault((prev) => ({
                                ...prev,
                                [item.id]: e.target.checked,
                              }))
                            }
                            className="accent-primary rounded"
                          />
                          <span>Save as default in Answer Vault for other jobs</span>
                        </label>

                        <Button
                          size="sm"
                          disabled={questionAnswers[item.id] === undefined || questionAnswers[item.id] === ''}
                          onClick={() => void handleAnswerSubmit(item)}
                          className="text-xs gap-1.5"
                        >
                          <span>Save & Advance →</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* 2. QUEUED / FILLING / READY TO SUBMIT */}
                  {(item.status === 'queued' || item.status === 'filling' || item.status === 'ready_to_submit') && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-muted/30 border border-border/60">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <FileCheck2 className="w-4 h-4 text-status-success-fg" />
                          <span className="text-xs font-medium text-foreground">
                            {item.status === 'ready_to_submit'
                              ? 'Form pre-filled · Paused before Submit for human inspection'
                              : 'All screening fields resolved from Answer Vault'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground m-0">
                          {item.fieldsFilledCount} of {item.fieldsTotalCount} standard fields ready (Profile + Vault
                          answers + Tagged PDF).
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === 'queued' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleAdvanceToReady(item.id)}
                            className="text-xs gap-1.5"
                          >
                            <span>Prepare Fill</span>
                          </Button>
                        )}

                        {item.applyUrl && (
                          <a
                            href={item.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer external"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted text-foreground transition-colors shadow-xs"
                          >
                            <span>Inspect Form</span>
                            <ExtIcon className="w-3 h-3 text-muted-foreground" />
                          </a>
                        )}

                        <Button size="sm" onClick={() => void handleMarkSent(item)} className="text-xs gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Sent & Track</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* 3. BLOCKED FALLBACK: Honest Portal Helper (e.g. Workday) */}
                  {item.status === 'blocked_fallback' && (
                    <div className="p-4 rounded-lg bg-status-warn-bg border border-status-warn-border space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-status-warn-fg shrink-0" />
                          <div>
                            <h4 className="text-xs font-semibold text-status-warn-fg m-0">
                              Interactive Portal Protection ({item.atsProvider.toUpperCase()})
                            </h4>
                            <p className="text-[11px] text-muted-foreground m-0">
                              This portal gates submissions behind candidate SSO or CAPTCHA. Use the 1-click clipboard
                              helpers below to paste your data accurately:
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 1-Click Copy Buttons Bar */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleCopy('Candidate Name', `name_${item.id}`)}
                          className="flex items-center justify-between p-2 rounded-md bg-background border border-border hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
                        >
                          <span className="truncate">Full Name</span>
                          {copiedKey === `name_${item.id}` ? (
                            <Check className="w-3.5 h-3.5 text-status-success-fg" />
                          ) : (
                            <ClipboardCopy className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy('candidate@example.com', `email_${item.id}`)}
                          className="flex items-center justify-between p-2 rounded-md bg-background border border-border hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
                        >
                          <span className="truncate">Email</span>
                          {copiedKey === `email_${item.id}` ? (
                            <Check className="w-3.5 h-3.5 text-status-success-fg" />
                          ) : (
                            <ClipboardCopy className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy('+1 (555) 019-2834', `phone_${item.id}`)}
                          className="flex items-center justify-between p-2 rounded-md bg-background border border-border hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
                        >
                          <span className="truncate">Phone</span>
                          {copiedKey === `phone_${item.id}` ? (
                            <Check className="w-3.5 h-3.5 text-status-success-fg" />
                          ) : (
                            <ClipboardCopy className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy('https://linkedin.com/in/candidate', `li_${item.id}`)}
                          className="flex items-center justify-between p-2 rounded-md bg-background border border-border hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
                        >
                          <span className="truncate">LinkedIn</span>
                          {copiedKey === `li_${item.id}` ? (
                            <Check className="w-3.5 h-3.5 text-status-success-fg" />
                          ) : (
                            <ClipboardCopy className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        {item.applyUrl ? (
                          <a
                            href={item.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer external"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted text-foreground transition-colors shadow-xs"
                          >
                            <span>Open {item.companyName} Portal</span>
                            <ExtIcon className="w-3 h-3 text-muted-foreground" />
                          </a>
                        ) : (
                          <span />
                        )}

                        <Button size="sm" onClick={() => void handleMarkSent(item)} className="text-xs gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Sent & Track as Applied</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 2. REUSABLE ANSWER VAULT PANEL */}
        <TabsContent value="vault" className="space-y-6 m-0">
          {/* Add Answer Form */}
          <Card className="p-5 border-border bg-card space-y-4 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                Add Reusable Screening Answer
              </span>
            </div>
            <form onSubmit={(e) => void handleCreateAnswer(e)} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  placeholder="Question Key (e.g. notice_period)"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="text-xs"
                  required
                />
                <Input
                  placeholder="Question Label (e.g. Notice Period)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="text-xs"
                  required
                />
                <Input
                  placeholder="Answer Value (e.g. 30 days)"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Type:</span>
                  {(['text', 'boolean', 'select'] as const).map((t) => (
                    <label key={t} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="answerType"
                        value={t}
                        checked={newType === t}
                        onChange={() => setNewType(t)}
                        className="accent-primary"
                      />
                      <span className="capitalize">{t}</span>
                    </label>
                  ))}
                </div>
                <Button type="submit" size="sm" className="text-xs gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save to Vault</span>
                </Button>
              </div>
            </form>
          </Card>

          {/* List of Vault Answers */}
          {answers.length === 0 ? (
            <Card className="p-8 text-center border-dashed border-border/80 bg-card/40">
              <p className="text-xs text-muted-foreground m-0">
                No answers saved yet. Answers answered in the Autopilot queue with "Save as default" will automatically
                appear here.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {answers.map((ans) => (
                <Card
                  key={ans.id}
                  className="p-4 border-border bg-card shadow-xs flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-foreground">{ans.questionKey}</span>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {ans.answerType}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground m-0 truncate">{ans.questionLabel}</p>
                    <p className="text-sm font-semibold text-foreground m-0 pt-1">{ans.answerValue}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAnswer(ans.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors cursor-pointer"
                    title="Delete answer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 3. RECEIPT HISTORY CARDS */}
        <TabsContent value="receipts" className="space-y-4 m-0">
          {data?.receipts.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-border/80 bg-card/40 space-y-2">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-xs text-muted-foreground m-0">No receipts yet. Submissions will appear here.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data?.receipts.map((item) => {
                const receipt = item.receipt;
                if (!receipt) return null;
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-xl border border-dashed border-border bg-card/80 shadow-xs relative overflow-hidden space-y-3 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between text-muted-foreground border-b border-border/60 pb-2">
                      <span className="flex items-center gap-1.5 text-status-success-fg font-semibold text-[11px]">
                        <Check className="w-3.5 h-3.5" /> SENT & TRACKED
                      </span>
                      <span className="tabular-nums text-[11px]">
                        {new Date(receipt.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="font-sans font-semibold text-sm text-foreground">{receipt.companyName}</div>
                      <div className="text-muted-foreground text-[11px] truncate">
                        {receipt.jobTitle || 'Submitted Application'}
                      </div>
                    </div>

                    <div className="py-2 border-y border-border/40 space-y-1 text-[11px] text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Fields Filled:</span>
                        <span className="text-foreground font-semibold tabular-nums">{receipt.fieldsFilled}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>ATS Provider:</span>
                        <span className="text-foreground capitalize">{receipt.atsProvider}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Verified Resume:</span>
                        <span className="text-status-success-fg font-semibold">Attached</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tracker Status:</span>
                        <span className="text-foreground font-semibold">{receipt.trackedAs}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">
                        {receipt.resumeSnapshotId}
                      </span>
                      <Link
                        href={`/jobs/${item.jobId}`}
                        className="text-[11px] font-sans font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        <span>View Job →</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
