import { EXPERIENCE_TYPE_MODULE } from '../modules/experience-type';
import type ExperienceTypeModuleService from '../modules/experience-type/service';

type ResolveContainer = { resolve: <T = unknown>(key: string) => T };

const WORKFLOW_LABELS: Record<string, string> = {
  cooking_class: "Chef's Cooking Class",
  plated_dinner: 'Plated Dinner Service',
  buffet_style: 'Buffet Style Service',
};

function getExperienceTypeId(chefEvent: Record<string, unknown>): string | null {
  const raw = chefEvent.experience_type_id ?? chefEvent.experienceTypeId;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

function getWorkflowEventType(chefEvent: Record<string, unknown>): string {
  const t = chefEvent.eventType ?? chefEvent.event_type;
  return typeof t === 'string' ? t : '';
}

/**
 * Customer-facing event type line for emails: prefer catalog name when linked, else workflow bucket label.
 */
export async function resolveChefEventTypeEmailLabel(
  container: ResolveContainer,
  chefEvent: Record<string, unknown>,
): Promise<string> {
  const expId = getExperienceTypeId(chefEvent);
  if (expId) {
    try {
      const svc = container.resolve(EXPERIENCE_TYPE_MODULE) as ExperienceTypeModuleService;
      const row = await svc.retrieveExperienceType(expId);
      if (row?.name) return row.name;
    } catch {
      // fall through to workflow label
    }
  }
  const wf = getWorkflowEventType(chefEvent);
  return WORKFLOW_LABELS[wf] || wf || 'Culinary experience';
}
