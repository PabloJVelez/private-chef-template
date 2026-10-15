import type { LoaderFunctionArgs } from 'react-router';
import { baseMedusaConfig } from '@libs/util/server/client.server';
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const params = new URLSearchParams({
    date: url.searchParams.get('date') || '',
    experience_id: url.searchParams.get('experience_id') || '',
  });
  try {
    const response = await fetch(`${baseMedusaConfig.baseUrl}/store/availability?${params}`, {
      headers: { 'x-publishable-api-key': baseMedusaConfig.publishableKey || '' },
      signal: AbortSignal.timeout(15000),
    });
    return Response.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ message: 'Availability is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
