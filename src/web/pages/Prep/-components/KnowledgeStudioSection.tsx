import { useEffect, useState } from 'react';
import { fetchInterviewKnowledgeStudio, type InterviewKnowledgeStudio } from '../../../api';
import { Badge } from '../../../components/ui/badge';

export function KnowledgeStudioSection() {
  const [studio, setStudio] = useState<InterviewKnowledgeStudio | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'formats' | 'research' | 'negotiation' | 'resources'>('formats');

  useEffect(() => {
    let cancelled = false;
    fetchInterviewKnowledgeStudio()
      .then((res) => {
        if (!cancelled) setStudio(res.studio);
      })
      .catch(() => {
        if (!cancelled) setStudio(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (!studio) return null;

  return (
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs mb-6 space-y-4"
      aria-labelledby="knowledge-studio-title"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 id="knowledge-studio-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
            Interview & Career Knowledge Studio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Structured interview formats, company research methodology, and principled negotiation tactics. No
            fabricated confidential questions.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border/80 pb-2 text-xs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'formats'}
          onClick={() => setActiveTab('formats')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'formats'
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          Format Playbooks ({studio.formatGuides.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'research'}
          onClick={() => setActiveTab('research')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'research'
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          Company Research Framework
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'negotiation'}
          onClick={() => setActiveTab('negotiation')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'negotiation'
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          Compensation Negotiation
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'resources'}
          onClick={() => setActiveTab('resources')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'resources'
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          Curated Reading
        </button>
      </div>

      {/* Format Playbooks */}
      {activeTab === 'formats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {studio.formatGuides.map((guide) => (
            <div key={guide.stage} className="p-4 rounded-lg border border-border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <strong className="text-sm font-semibold text-foreground">{guide.title}</strong>
                <Badge variant="secondary" className="text-[10px]">
                  ~{guide.typicalDurationMinutes} min
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground m-0">{guide.description}</p>
              <div className="space-y-1.5 pt-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    Key Preparation Tactics:
                  </span>
                  <ul className="m-0 pl-4 space-y-0.5 text-muted-foreground">
                    {guide.keyPreparationTactics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-destructive block">Pitfalls to Avoid:</span>
                  <ul className="m-0 pl-4 space-y-0.5 text-muted-foreground">
                    {guide.pitfallsToAvoid.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Company Research Framework */}
      {activeTab === 'research' && (
        <div className="space-y-3 pt-2">
          {studio.researchFramework.map((step) => (
            <div key={step.step} className="p-4 rounded-lg border border-border bg-card space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold text-xs flex items-center justify-center">
                  {step.step}
                </span>
                <strong className="text-sm font-semibold text-foreground">{step.title}</strong>
              </div>
              <p className="text-xs text-muted-foreground m-0">{step.purpose}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs">
                <div className="p-2.5 rounded bg-muted/30">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                    Checklist Items:
                  </span>
                  <ul className="m-0 pl-4 space-y-0.5 text-muted-foreground">
                    {step.checkItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-2.5 rounded bg-muted/30">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                    Verified Sources:
                  </span>
                  <ul className="m-0 pl-4 space-y-0.5 text-muted-foreground">
                    {step.evidenceSources.map((source) => (
                      <li key={source}>{source}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Negotiation Playbook */}
      {activeTab === 'negotiation' && (
        <div className="space-y-3 pt-2">
          {studio.negotiationPlaybook.map((play) => (
            <div key={play.id} className="p-4 rounded-lg border border-border bg-card space-y-2">
              <strong className="text-sm font-semibold text-foreground block">{play.title}</strong>
              <p className="text-xs text-muted-foreground m-0">{play.tactic}</p>
              <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-1 text-xs">
                <span className="text-[10px] uppercase font-semibold text-primary block">Example Script:</span>
                <p className="text-foreground italic m-0">“{play.exampleScript}”</p>
              </div>
              <p className="text-[11px] text-muted-foreground m-0">
                <strong>Ethical guardrail:</strong> {play.ethicalGuardrail}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Curated External Resources */}
      {activeTab === 'resources' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {studio.externalCuratedResources.map((res) => (
            <div key={res.url} className="p-3.5 rounded-lg border border-border bg-card space-y-1 text-xs">
              <a
                href={res.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-primary hover:underline block text-sm"
              >
                {res.title} ↗
              </a>
              <span className="text-muted-foreground block">
                Publisher: {res.authorOrPublisher} • Topic: {res.topic}
              </span>
              <p className="text-[11px] text-muted-foreground m-0 pt-1 italic">{res.attributionNote}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
