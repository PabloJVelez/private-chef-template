import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { readRequests } from '../../../../lib/chef-workspace/read';
import { parseQuery, requestQuery } from '../../../../lib/chef-workspace/query';

// Medusa's /admin authentication applies; there is intentionally no store/public counterpart.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await readRequests(req.scope, parseQuery(requestQuery, req.query)));
}
