import type { LoaderFunctionArgs } from 'react-router';
import { readMealPrep } from '@libs/util/server/meal-prep.server';
export async function loader({ request }: LoaderFunctionArgs) {
  const result = await readMealPrep(request);
  return Response.json(
    result.ok
      ? result.discovery
      : {
          message: 'Meal Prep information is temporarily unavailable. Please try again.',
          retryable: true,
        },
    { status: result.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
