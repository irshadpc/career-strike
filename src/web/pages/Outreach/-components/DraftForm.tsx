import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import {
  type ApplicationSummary,
  api,
  type OutreachDraft,
  type OutreachPurpose,
  type ProfessionalContact,
} from '../../../api';
import { Button } from '../../../components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../../components/ui/form';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { useToast } from '../../../components/ui/toast';
import { type DraftFormValues, draftSchema } from '../-schema/outreach';

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function DraftForm({
  contacts,
  applications,
  onSaved,
}: {
  contacts: ProfessionalContact[];
  applications: ApplicationSummary[];
  onSaved: (draft: OutreachDraft) => void;
}) {
  const { toast } = useToast();
  const form = useForm<DraftFormValues>({
    resolver: zodResolver(draftSchema),
    defaultValues: {
      contactId: contacts[0]?.id ?? '',
      applicationId: '',
      channel: 'linkedin',
      purpose: 'referral',
      subject: '',
      body: '',
    },
  });
  const contactId = useWatch({ control: form.control, name: 'contactId' });
  const purpose = useWatch({ control: form.control, name: 'purpose' });

  const applyTemplate = async (): Promise<void> => {
    try {
      const { template } = await api<{ template: { subject: string | null; body: string } }>(
        `/api/outreach/template?purpose=${encodeURIComponent(purpose)}&contactId=${encodeURIComponent(contactId)}`,
      );
      form.setValue('subject', template.subject ?? '');
      form.setValue('body', template.body);
    } catch {
      toast({ variant: 'destructive', title: 'Could not load template' });
    }
  };

  const submit = async (values: DraftFormValues): Promise<void> => {
    try {
      const { draft } = await api<{ draft: OutreachDraft }>('/api/outreach', {
        method: 'POST',
        body: {
          contactId: values.contactId,
          applicationId: values.applicationId || null,
          channel: values.channel,
          purpose: values.purpose,
          subject: values.subject || null,
          body: values.body,
        },
      });
      form.reset({
        contactId: values.contactId,
        applicationId: '',
        channel: values.channel,
        purpose: values.purpose,
        subject: '',
        body: '',
      });
      onSaved(draft);
    } catch {
      toast({ variant: 'destructive', title: 'Could not save outreach draft' });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="contactId"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel>Contact</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                        {contact.employer ? ` — ${contact.employer}` : ''}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="applicationId"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel>Linked application (optional)</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    <option value="">—</option>
                    {applications.map((application) => (
                      <option key={application.id} value={application.id}>
                        {application.title} — {application.employer}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="channel"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel>Where you will send it</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    <option value="linkedin">LinkedIn</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="purpose"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel>Purpose</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    <option value="referral">Ask for perspective, not a referral</option>
                    <option value="recruiter">Introduce yourself to a recruiter</option>
                    <option value="follow_up">Follow up on an application</option>
                    <option value="thank_you">Thank someone after a conversation</option>
                    <option value="other">Other</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel>Subject (optional)</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea rows={8} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void applyTemplate()}>
            Use a starting template
          </Button>
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting || contacts.length === 0}>
            {form.formState.isSubmitting ? 'Saving…' : 'Save local draft'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export const PURPOSE_LABEL: Record<OutreachPurpose, string> = {
  referral: 'Referral conversation',
  recruiter: 'Recruiter introduction',
  follow_up: 'Follow-up',
  thank_you: 'Thank you',
  other: 'Other',
};
