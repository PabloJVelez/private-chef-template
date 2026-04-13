import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { EXPERIENCE_TYPE_MODULE } from '../../../../modules/experience-type';
import type ExperienceTypeModuleService from '../../../../modules/experience-type/service';

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(EXPERIENCE_TYPE_MODULE) as ExperienceTypeModuleService;
  const slug = req.params.slug;

  const experienceType = await svc.getBySlug(slug);

  if (!experienceType) {
    res.status(404).json({ message: 'Experience type not found' });
    return;
  }

  res.status(200).json({ experience_type: experienceType });
}
