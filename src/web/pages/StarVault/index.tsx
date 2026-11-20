import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../components/ui/toast';

interface Story {
  id: string;
  competency: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reuseCount: number;
  createdAt: string;
}

const COMPETENCIES = ['Leadership', 'Conflict', 'Scale/Impact', 'Failure', 'Ambiguity', 'Ownership'];

export function StarVault() {
  const { toast } = useToast();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState({
    competency: COMPETENCIES[0],
    title: '',
    situation: '',
    task: '',
    action: '',
    result: '',
  });
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [persona, setPersona] = useState<'warm' | 'skeptical' | 'ai'>('warm');
  const [score, setScore] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ stories: Story[] }>('/api/star-stories');
      setStories(r.stories);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveStory = async () => {
    if (!draft.title.trim()) {
      toast({ variant: 'destructive', title: 'Title required' });
      return;
    }
    try {
      await api('/api/star-stories', {
        method: 'POST',
        body: {
          competency: draft.competency,
          title: draft.title.trim(),
          situation: draft.situation.trim(),
          task: draft.task.trim(),
          action: draft.action.trim(),
          result: draft.result.trim(),
        },
      });
      setDraft({ competency: COMPETENCIES[0], title: '', situation: '', task: '', action: '', result: '' });
      toast({ variant: 'success', title: 'STAR story saved', description: 'It will compound across interviews.' });
      void load();
    } catch {
      toast({ variant: 'destructive', title: 'Could not save story' });
    }
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ variant: 'destructive', title: 'Speech recognition not supported in this browser' });
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (ev: any) => {
      let t = '';
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript + ' ';
      setTranscript(t.trim());
    };
    rec.onend = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
    setTranscript('');
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const speak = (text: string) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    window.speechSynthesis?.speak(u);
  };

  const askQuestion = () => {
    const questions: Record<string, string[]> = {
      warm: [
        'Tell me about a time you led a project under a tight deadline.',
        'Describe a conflict you resolved with a teammate.',
      ],
      skeptical: [
        'Your resume says you reduced latency by 40%. Walk me through exactly how you measured that.',
        'Why should we hire you over someone with more direct experience?',
      ],
      ai: ['In 90 seconds, explain your most impactful project and its measurable outcome.'],
    };
    const list = (questions[persona] ?? questions.warm) as string[];
    const q = list[Math.floor(Math.random() * list.length)] as string;
    speak(q);
    toast({ title: 'Question asked', description: q });
  };

  const evaluate = () => {
    const words = transcript.trim().split(/\s+/).filter(Boolean).length;
    const filler = (transcript.match(/\b(um|uh|like|you know|sort of)\b/gi) ?? []).length;
    const hasMetrics = /\d/.test(transcript);
    const verdict = [
      `Words: ${words}`,
      `Filler words: ${filler}`,
      hasMetrics ? 'Quantified outcome: yes' : 'Quantified outcome: missing',
      words >= 80 && words <= 260 ? 'Length: good (1–2 min)' : 'Length: adjust (aim 80–260 words)',
    ].join(' · ');
    setScore(verdict);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Interview compounding"
        title="STAR story vault & voice simulator"
        lede="Spoken retrieval is the skill. Practice out loud, debrief within 3 minutes, and let every interview raise your floor."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* STAR vault */}
        <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3">
          <h2 className="text-base font-bold text-foreground m-0">STAR story vault</h2>
          <p className="text-xs text-muted-foreground m-0">
            Tag by competency. Reuse counters show which stories carry your interviews.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={draft.competency}
              onChange={(e) => setDraft({ ...draft, competency: e.target.value })}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {COMPETENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Story title"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          {(['situation', 'task', 'action', 'result'] as const).map((k) => (
            <Textarea
              key={k}
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
              rows={2}
              className="text-xs"
            />
          ))}
          <Button size="sm" className="w-full" onClick={() => void saveStory()}>
            Save story
          </Button>

          <div className="pt-3 border-t border-border space-y-2">
            <h3 className="text-xs font-semibold text-foreground m-0">Saved stories</h3>
            {error && <ErrorPanel message="Could not load stories." onRetry={() => void load()} />}
            {!stories && !error && <Loading label="Loading stories" />}
            {stories && stories.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No stories yet. Capture your first win.</p>
            )}
            {stories?.map((s) => (
              <div key={s.id} className="p-3 rounded-md bg-muted/20 border border-border/40 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {s.competency}
                  </Badge>
                  <span className="text-muted-foreground">reuse ×{s.reuseCount}</span>
                </div>
                <p className="m-0 font-medium text-foreground">{s.title}</p>
                <p className="m-0 text-muted-foreground line-clamp-2">{s.result || s.action || s.situation}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={async () => {
                    await api(`/api/star-stories/${s.id}/reuse`, { method: 'POST' }).catch(() => {});
                    void load();
                  }}
                >
                  Mark reused
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Voice simulator */}
        <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3">
          <h2 className="text-base font-bold text-foreground m-0">Voice interview simulator</h2>
          <p className="text-xs text-muted-foreground m-0">
            Browser mic + speech synthesis. No subscription, no cloud upload — your audio stays on this device.
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {(['warm', 'skeptical', 'ai'] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={persona === p ? 'default' : 'outline'}
                className="text-xs"
                onClick={() => setPersona(p)}
              >
                {p === 'warm'
                  ? 'Warm recruiter'
                  : p === 'skeptical'
                    ? 'Skeptical staff engineer'
                    : 'Timed AI screen (90s)'}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={askQuestion}>
              Ask a question
            </Button>
            {!listening ? (
              <Button size="sm" onClick={startListening}>
                Start answering
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={stopListening}>
                Stop
              </Button>
            )}
          </div>
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            placeholder="Your spoken answer will appear here (editable)…"
            className="text-xs"
          />
          <Button size="sm" variant="outline" className="w-full" onClick={evaluate} disabled={!transcript.trim()}>
            Evaluate delivery
          </Button>
          {score && <p className="text-xs text-muted-foreground m-0 font-mono">{score}</p>}
          <div className="pt-3 border-t border-border text-xs text-muted-foreground space-y-1">
            <p className="m-0">
              <strong className="text-foreground">Hot debrief:</strong> right after any real interview, capture tough
              questions and stumbling blocks here within 3 minutes, before memory fades.
            </p>
            <Textarea placeholder="Quick debrief notes…" rows={3} className="text-xs" />
          </div>
        </section>
      </div>
    </div>
  );
}

export default StarVault;
