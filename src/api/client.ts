import { SERVER_URL } from '../config';

let currentToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentToken = token;
}

export function isServerConfigured(): boolean {
  return !SERVER_URL.includes('YOUR-DEPLOYED-SERVER-URL');
}

function ensureConfigured() {
  if (!isServerConfigured()) {
    throw new Error(
      'Server is not configured yet. Update SERVER_URL in src/config.ts after deploying the /server folder.'
    );
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<T> {
  ensureConfigured();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

  const response = await fetch(`${SERVER_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // no body
  }

  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return data as T;
}
