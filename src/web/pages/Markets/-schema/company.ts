import { z } from 'zod';

export const companySchema = z.object({
  name: z.string().trim().min(1, 'Enter the company name').max(200),
  officialWebsite: z.union([z.string().trim().url('Enter a full URL'), z.literal('')]).optional(),
  careersUrl: z.union([z.string().trim().url('Enter a full URL'), z.literal('')]).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CompanyFormValues = z.infer<typeof companySchema>;
