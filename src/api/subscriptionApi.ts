import { apiRequest } from './client';

export interface Business {
  id: string;
  name: string;
  businessType: string;
  subscriptionStatus: 'trial' | 'active' | 'expired';
  productLimit: number | null;
  trialStartedAt: string;
  subscriptionActivatedAt: string | null;
  createdAt: string;
}

export interface SubscriptionStatus {
  business: Business;
  productCount: number;
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  return apiRequest('/api/subscription/status');
}

export async function requestUpgrade(note: string): Promise<void> {
  await apiRequest('/api/subscription/request-upgrade', { method: 'POST', body: { note } });
}
