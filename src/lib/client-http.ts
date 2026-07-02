import { apiErrorResponseSchema } from './generation-contracts';

export async function readApiError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  const error = apiErrorResponseSchema.safeParse(payload);
  return error.success ? error.data.error : 'Request failed.';
}

export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<T>;
}
