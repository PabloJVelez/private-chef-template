import { Button, Container, Heading, Input, Label, Switch, Text } from '@medusajs/ui';
import { noticeRuleSchema, type NoticeRule } from '../../../lib/availability/slots';

type Experience = { id: string; name: string; is_active: boolean };
export function NoticeRules({
  rules,
  experiences,
  onChange,
}: {
  rules: NoticeRule[];
  experiences: Experience[];
  onChange: (rules: NoticeRule[]) => void;
}) {
  const current = rules[0] ?? {
    enabled: false,
    days: 7,
    scope: 'all' as const,
    experience_ids: [],
  };
  const update = (_index: number, change: Partial<NoticeRule>) => onChange([{ ...current, ...change }]);
  if (rules.length > 1)
    return (
      <Container className="space-y-4">
        <Heading level="h2">Advance notice</Heading>
        <Text size="small">
          Your existing experiences have different notice periods. They remain in effect until you replace
          them with one shared setting.
        </Text>
        <ul className="list-disc pl-5 text-sm">
          {rules.map((rule, index) => (
            <li key={index}>
              {rule.days} days:{' '}
              {rule.scope === 'all'
                ? 'All experiences'
                : rule.experience_ids
                    .map(
                      (id) =>
                        experiences.find((experience) => experience.id === id)?.name ??
                        'Unavailable experience',
                    )
                    .join(', ')}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([
              {
                enabled: true,
                days: Math.max(...rules.map((rule) => rule.days)),
                scope: 'all',
                experience_ids: [],
              },
            ])
          }
        >
          Use one shared setting
        </Button>
      </Container>
    );
  return (
    <Container className="space-y-4">
      <Heading level="h2">Advance notice</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Choose how many days ahead clients must book. Experiences without an enabled rule can accept same-day
        requests when hours allow.
      </Text>
      {[current].map((rule, index) => {
        const validation = noticeRuleSchema.safeParse(rule);
        return (
          <fieldset key={index} className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm">Booking notice</legend>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id={`notice-${index}`}
                  checked={rule.enabled}
                  onCheckedChange={(enabled) => update(index, { enabled })}
                />
                <Label htmlFor={`notice-${index}`}>Require advance notice</Label>
              </div>
            </div>
            {rule.enabled && (
              <>
                <label className="block text-sm">
                  Advance notice (days)
                  <Input
                    aria-label="Advance notice (days)"
                    type="number"
                    min={1}
                    step={1}
                    value={Number.isNaN(rule.days) ? '' : rule.days}
                    onChange={(event) => update(index, { days: event.target.valueAsNumber })}
                  />
                </label>
                <label className="block text-sm">
                  Applies to
                  <select
                    aria-label="Applies to"
                    className="mt-1 block w-full rounded border p-2"
                    value={rule.scope}
                    onChange={(event) =>
                      update(index, {
                        scope: event.target.value as NoticeRule['scope'],
                      })
                    }
                  >
                    <option value="all">All experiences (including future experiences)</option>
                    <option value="selected">Selected experiences</option>
                  </select>
                </label>
                {rule.scope === 'selected' && (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {!experiences.length && <Text size="small">Create an experience to select it here.</Text>}
                    {experiences.map((experience) => (
                      <label key={experience.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={rule.experience_ids.includes(experience.id)}
                          onChange={(event) =>
                            update(index, {
                              experience_ids: event.target.checked
                                ? [...rule.experience_ids, experience.id]
                                : rule.experience_ids.filter((id) => id !== experience.id),
                            })
                          }
                        />
                        {experience.name}
                        {!experience.is_active && ' (inactive)'}
                      </label>
                    ))}
                    {rule.experience_ids
                      .filter((id) => !experiences.some((experience) => experience.id === id))
                      .map((id) => (
                        <label key={id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked
                            onChange={() =>
                              update(index, {
                                experience_ids: rule.experience_ids.filter((value) => value !== id),
                              })
                            }
                          />
                          Unavailable experience ({id})
                        </label>
                      ))}
                  </div>
                )}
              </>
            )}
            {!validation.success && (
              <Text size="small" className="text-ui-fg-error" role="alert">
                {validation.error.issues[0].message}
              </Text>
            )}
          </fieldset>
        );
      })}
    </Container>
  );
}
