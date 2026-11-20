import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, type ProfileFact } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../../components/ui/form';
import { Textarea } from '../../../components/ui/textarea';
import { useToast } from '../../../components/ui/toast';
import { type SuggestSkillsFormValues, suggestSkillsSchema } from '../-schema/profile';

export function SuggestSkillsSection({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<string | null>(null);

  const form = useForm<SuggestSkillsFormValues>({
    resolver: zodResolver(suggestSkillsSchema),
    defaultValues: {
      text: '',
    },
  });

  const onSubmit = async (values: SuggestSkillsFormValues): Promise<void> => {
    try {
      const { suggested } = await api<{ suggested: ProfileFact[] }>('/api/profile/suggestions', {
        method: 'POST',
        body: { text: values.text },
      });
      form.reset();
      const count = suggested.length;
      setStatus(
        count === 0
          ? 'No new skills found. Add any that are missing by hand below.'
          : `${count} skill${count === 1 ? '' : 's'} suggested below. Approve the ones that are true; nothing is used until you do.`,
      );
      toast({
        variant: count > 0 ? 'success' : 'default',
        title: count === 0 ? 'No new skills found' : `${count} skill${count === 1 ? '' : 's'} suggested`,
        description:
          count === 0
            ? 'Everything recognisable is already in your profile. Add any missing skills by hand.'
            : 'Approve the ones that are true — nothing is used until you do.',
        action:
          count > 0
            ? {
                label: 'Review skills',
                onClick: () =>
                  document.getElementById('profile-skill')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
              }
            : undefined,
      });
      onChange();
    } catch {
      setStatus('Could not read the text. Check that the service is running.');
      toast({
        variant: 'destructive',
        title: 'Could not read the résumé text',
        description: 'Check that the service is running, then try again.',
      });
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-xs" aria-labelledby="suggest-title">
      <h2 id="suggest-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
        Suggest skills from your résumé
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Paste the text of your résumé. Career Strike looks for skills it recognises, on this computer, and lists them
        for you to approve or discard. The pasted text is not saved.
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormField
            control={form.control}
            name="text"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor="resume-text">Résumé text</FormLabel>
                <FormControl>
                  <Textarea
                    id="resume-text"
                    rows={6}
                    placeholder="Paste résumé content here..."
                    autoComplete="off"
                    spellCheck={false}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end pt-1">
            <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Analyzing…' : 'Suggest skills'}
            </Button>
          </div>
        </form>
      </Form>
      {status && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground mt-2">
          {status}
        </p>
      )}
    </section>
  );
}
