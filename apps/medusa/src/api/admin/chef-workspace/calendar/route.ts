import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { readCalendar } from '../../../../lib/chef-workspace/read';
import { parseQuery, calendarQuery } from '../../../../lib/chef-workspace/query';

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await readCalendar(req.scope, parseQuery(calendarQuery, req.query)));
}
