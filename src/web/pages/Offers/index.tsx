import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { useToast } from '../../components/ui/toast';

interface OfferInputs {
  base: number;
  bonusPct: number;
  signOn: number;
  rsuTotal: number;
  vestYears: number;
  cliffYears: number;
  exitMultiple: number;
  taxRate: number;
  colIndex: number;
}

interface SavedOfferScenario {
  id: string;
  name: string;
  data: OfferInputs;
  createdAt: string;
}

const DEFAULTS: OfferInputs = {
  base: 150000,
  bonusPct: 10,
  signOn: 25000,
  rsuTotal: 200000,
  vestYears: 4,
  cliffYears: 1,
  exitMultiple: 1.5,
  taxRate: 35,
  colIndex: 100,
};

function compute(o: OfferInputs) {
  const annualBonus = o.base * (o.bonusPct / 100);
  const annualRsu = o.rsuTotal / o.vestYears;
  const grossAnnual = o.base + annualBonus + annualRsu;
  const tax = grossAnnual * (o.taxRate / 100);
  const netAnnual = grossAnnual - tax;
  const colAdjusted = netAnnual * (100 / o.colIndex);
  const fourYearCash = (o.base + annualBonus) * o.vestYears + o.signOn;
  const fourYearEquity = o.rsuTotal * o.exitMultiple;
  const fourYearTotal = fourYearCash + fourYearEquity;
  const cliffValue = o.rsuTotal * (1 - 1 / o.vestYears); // illustrative: value after cliff
  return {
    annualBonus,
    annualRsu,
    grossAnnual,
    tax,
    netAnnual,
    colAdjusted,
    fourYearCash,
    fourYearEquity,
    fourYearTotal,
    cliffValue,
  };
}

export function Offers() {
  const { toast } = useToast();
  const [inputs, setInputs] = useState<OfferInputs>(DEFAULTS);
  const [scenarioName, setScenarioName] = useState('');
  const [saving, setSaving] = useState(false);
  const [scenarios, setScenarios] = useState<SavedOfferScenario[]>([]);
  const r = useMemo(() => compute(inputs), [inputs]);

  const loadScenarios = useCallback(async () => {
    try {
      const res = await api<{ scenarios: SavedOfferScenario[] }>('/api/offer-scenarios');
      setScenarios(res.scenarios ?? []);
    } catch {
      // ignore initial load error cleanly
    }
  }, []);

  useEffect(() => {
    void loadScenarios();
  }, [loadScenarios]);

  const set = (k: keyof OfferInputs, v: number) => setInputs((p) => ({ ...p, [k]: v }));

  const saveScenario = async () => {
    if (!scenarioName.trim()) {
      toast({ variant: 'destructive', title: 'Name the scenario first' });
      return;
    }
    setSaving(true);
    try {
      await api('/api/offer-scenarios', {
        method: 'POST',
        body: { name: scenarioName.trim(), data: inputs },
      });
      toast({ variant: 'success', title: 'Scenario saved', description: scenarioName.trim() });
      setScenarioName('');
      await loadScenarios();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not save scenario',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteScenario = async (id: string) => {
    try {
      await api(`/api/offer-scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast({ variant: 'success', title: 'Scenario deleted' });
      await loadScenarios();
    } catch {
      toast({ variant: 'destructive', title: 'Could not delete scenario' });
    }
  };

  const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div>
      <PageHeader
        eyebrow="Offer intelligence lab"
        title="Model your offer before you sign"
        lede="100% private, client-side. Compare 4-year cash and equity, tax, and cost-of-living — then negotiate from data, not vibes."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-4">
          <h2 className="text-base font-bold text-foreground m-0">Inputs</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base salary" value={inputs.base} onChange={(v) => set('base', v)} />
            <Field label="Target bonus %" value={inputs.bonusPct} onChange={(v) => set('bonusPct', v)} />
            <Field label="Sign-on cash" value={inputs.signOn} onChange={(v) => set('signOn', v)} />
            <Field label="RSU/equity total (4yr)" value={inputs.rsuTotal} onChange={(v) => set('rsuTotal', v)} />
            <Field label="Vest years" value={inputs.vestYears} onChange={(v) => set('vestYears', v)} />
            <Field label="Cliff years" value={inputs.cliffYears} onChange={(v) => set('cliffYears', v)} />
            <Field
              label="Exit multiple"
              value={inputs.exitMultiple}
              onChange={(v) => set('exitMultiple', v)}
              step={0.1}
            />
            <Field label="Effective tax rate %" value={inputs.taxRate} onChange={(v) => set('taxRate', v)} />
            <Field label="COL index (100 = baseline)" value={inputs.colIndex} onChange={(v) => set('colIndex', v)} />
          </div>
          <div className="flex gap-2 pt-2">
            <input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Scenario name (e.g. Acme offer)"
              aria-label="Scenario name"
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button size="sm" disabled={saving} onClick={() => void saveScenario()}>
              {saving ? 'Saving…' : 'Save scenario'}
            </Button>
          </div>
          {scenarios.length > 0 && (
            <div className="pt-3 border-t border-border space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground m-0">
                Saved scenarios ({scenarios.length})
              </h3>
              <ul className="space-y-1.5 m-0 p-0 list-none">
                {scenarios.map((s) => {
                  const summary = compute(s.data);
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-md border border-border/70 bg-muted/20 text-xs"
                    >
                      <div className="min-w-0">
                        <strong className="text-foreground block truncate">{s.name}</strong>
                        <span className="text-muted-foreground font-mono">
                          4-yr total: ${money(summary.fourYearTotal)} · Net/yr: ${money(summary.netAnnual)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setInputs(s.data);
                            toast({ variant: 'success', title: `Loaded "${s.name}"` });
                          }}
                        >
                          Load
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => void deleteScenario(s.id)}>
                          Delete
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-4">
          <h2 className="text-base font-bold text-foreground m-0">4-year model</h2>
          <div className="space-y-2 text-sm">
            <Row label="Annual bonus" value={`$${money(r.annualBonus)}`} />
            <Row label="Annual equity (vested)" value={`$${money(r.annualRsu)}`} />
            <Row label="Gross annual" value={`$${money(r.grossAnnual)}`} />
            <Row label="Tax (est.)" value={`$${money(r.tax)}`} />
            <Row label="Net annual" value={`$${money(r.netAnnual)}`} bold />
            <Row label="COL-adjusted net" value={`$${money(r.colAdjusted)}`} />
            <div className="border-t border-border pt-2 space-y-2">
              <Row label="4-yr cash (base+bonus+sign-on)" value={`$${money(r.fourYearCash)}`} />
              <Row label="4-yr equity (× exit)" value={`$${money(r.fourYearEquity)}`} />
              <Row label="4-yr total" value={`$${money(r.fourYearTotal)}`} bold />
            </div>
          </div>
          <div className="pt-3 border-t border-border text-xs text-muted-foreground space-y-1">
            <p className="m-0">
              <strong className="text-foreground">Negotiation levers:</strong> exploding deadlines, sign-on bridges,
              equity refresh grants, post-termination exercise windows. Coached tech candidates commonly self-report
              15–30% uplifts over initial offers (IGotAnOffer/Levels.fyi).
            </p>
            <p className="m-0">
              <strong className="text-foreground">Tax note:</strong> US RSUs face 22% federal supplemental withholding
              vs. your actual marginal bracket; ISOs carry AMT exposure. India applies perquisite tax on (FMV − exercise
              price) at vest/exercise plus capital gains. Adjust the effective rate above to model your regime.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-medium text-foreground">{label}</span>
      <input
        type="number"
        step={step ?? 1}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className={bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{label}</span>
      <span className={bold ? 'font-bold text-foreground' : 'font-mono text-foreground'}>{value}</span>
    </div>
  );
}

export default Offers;
