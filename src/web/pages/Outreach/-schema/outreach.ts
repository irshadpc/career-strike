import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Enter the person’s name').max(160),
  employer: z.string().trim().max(200).optional(),
  roleTitle: z.string().trim().max(200).optional(),
  profileUrl: z.union([z.string().trim().url('Enter a full URL'), z.literal('')]).optional(),
  email: z.union([z.string().trim().email('Enter a valid email address'), z.literal('')]).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type ContactFormValues = z.infer<typeof contactSchema>;

export const draftSchema = z.object({
  contactId: z.string().min(1, 'Choose a contact'),
  applicationId: z.string().optional(),
  channel: z.enum(['linkedin', 'email', 'other']),
  purpose: z.enum(['referral', 'recruiter', 'follow_up', 'thank_you', 'other']),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1, 'Write the message before requesting approval').max(10_000),
});

export type DraftFormValues = z.infer<typeof draftSchema>;
