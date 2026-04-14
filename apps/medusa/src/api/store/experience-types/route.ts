import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { EXPERIENCE_TYPE_MODULE } from '../../../modules/experience-type';
import type ExperienceTypeModuleService from '../../../modules/experience-type/service';

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(EXPERIENCE_TYPE_MODULE) as ExperienceTypeModuleService;

  const experienceTypes = await svc.listActiveExperienceTypes();

  res.status(200).json({ experience_types: experienceTypes });
}
