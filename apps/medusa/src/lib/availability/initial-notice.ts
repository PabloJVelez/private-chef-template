import type { MedusaContainer } from '@medusajs/framework/types';
import { EXPERIENCE_TYPE_MODULE } from '../../modules/experience-type';
import type ExperienceTypeModuleService from '../../modules/experience-type/service';
import { noticeRuleSchema, type NoticeRule } from './slots';

/** First-setup defaults only, never a runtime fallback for a saved schedule.
 * Read through the owning module after migrations, including inactive experiences.
 * Selected scopes preserve mixed policies without imposing them on future experiences.
 */
export async function initialNoticeRules(container: MedusaContainer): Promise<NoticeRule[]> {
  const experiences = container.resolve<ExperienceTypeModuleService>(EXPERIENCE_TYPE_MODULE);
  const groups = new Map<number, string[]>();
  for (let skip = 0; ; skip += 100) {
    const page = await experiences.listExperienceTypes(
      { requires_advance_notice: true },
      { skip, take: 100, order: { id: 'ASC' } },
    );
    for (const experience of page) {
      if (experience.advance_notice_days <= 0) continue;
      const ids = groups.get(experience.advance_notice_days) ?? [];
      ids.push(experience.id);
      groups.set(experience.advance_notice_days, ids);
    }
    if (page.length < 100) break;
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([days, experience_ids]) =>
    noticeRuleSchema.parse({ enabled: true, days, scope: 'selected', experience_ids }),
  );
}
