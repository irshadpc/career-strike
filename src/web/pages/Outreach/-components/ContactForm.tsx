import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { api, type ProfessionalContact } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../../components/ui/form';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { type ContactFormValues, contactSchema } from '../-schema/outreach';

export function ContactForm({ onSaved }: { onSaved: (contact: ProfessionalContact) => void }) {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', employer: '', roleTitle: '', profileUrl: '', email: '', notes: '' },
  });

  const submit = async (values: ContactFormValues): Promise<void> => {
    const { contact } = await api<{ contact: ProfessionalContact }>('/api/outreach/contacts', {
      method: 'POST',
      body: {
        name: values.name,
        employer: values.employer || null,
        roleTitle: values.roleTitle || null,
        profileUrl: values.profileUrl || null,
        email: values.email || null,
        notes: values.notes || null,
      },
    });
    form.reset();
    onSaved(contact);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="employer"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel>Employer (optional)</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="roleTitle"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel>Their role (optional)</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="profileUrl"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel>Profile URL (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="https://…" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel>Email (optional)</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel>Private notes (optional)</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : 'Add contact'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
