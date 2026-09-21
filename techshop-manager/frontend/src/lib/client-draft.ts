import { z } from 'zod';
import { api } from '@/lib/api';

export const clientDraftSchema = z.object({
  prenom: z.string().trim().min(2, 'Minimum 2 caractères').max(50),
  nom: z.string().trim().min(2, 'Minimum 2 caractères').max(50),
  telephone: z.string().regex(/^\+243[0-9]{9}$/, 'Format invalide (+243XXXXXXXXX)'),
  siteId: z.string().min(1, 'Site requis'),
  email: z.string().email('Email invalide').or(z.literal('')).optional().transform(value => value || undefined),
  codeParrain: z.string().optional().transform(value => value || undefined),
}).strict();

export type ClientDraftValues = z.infer<typeof clientDraftSchema>;

export interface ClientDraftResult {
  client: {
    id: string;
    prenom: string;
    nom: string;
    telephone: string;
    statut: 'EN_COURS';
    createdById: string | null;
  };
  etapeId: string;
}

export async function createClientDraft(values: ClientDraftValues): Promise<ClientDraftResult> {
  const response = await api.post<ClientDraftResult>('/clients/onboarding/draft', values);
  return response.data;
}
