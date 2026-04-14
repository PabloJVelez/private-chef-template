import { MedusaService } from '@medusajs/framework/utils';
import ExperienceType from './models/experience-type';

class ExperienceTypeModuleService extends MedusaService({
  ExperienceType,
}) {
  async listActiveExperienceTypes() {
    return this.listExperienceTypes(
      { is_active: true },
      {
        order: { sort_order: 'ASC' },
      },
    );
  }

  async getBySlug(slug: string) {
    const [result] = await this.listExperienceTypes({ slug, is_active: true });
    return result || null;
  }
}

export default ExperienceTypeModuleService;
