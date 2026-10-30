import { Button, Container, Heading, Input, Text } from '@medusajs/ui';
import { useState } from 'react';
import { emptyMealPrepSetup, mealPrepSetupSchema, type MealPrepSetup } from '../../../lib/availability/slots';
import { dayNames } from './editor';
import { HoursEditor } from './hours-editor';
import { sdk } from '../../../sdk';
import type { MealPrepWorkReview } from '../../../sdk/admin/admin-availability';

const methodNames = { in_home: 'In-home cooking', delivery: 'Delivery', pickup: 'Pickup' } as const;
const styleNames = {
  individual_dishes: 'Individual dishes and quantities',
  package: 'Packages',
  chosen_menu: 'Chosen-menu visit',
  tailored_plan: 'Tailored-plan request',
} as const;

export function MealPrepSetupEditor({
  value,
  onChange,
}: {
  value: MealPrepSetup | null | undefined;
  onChange: (value: MealPrepSetup) => void;
}) {
  const setup = value ?? emptyMealPrepSetup();
  const validation = mealPrepSetupSchema.safeParse(setup);
  return (
    <Container className="space-y-4">
      <Heading level="h2">Meal prep setup</Heading>
      <Text>
        Draft setup — meal prep is not available to customers yet. Save these preferences with your
        availability.
      </Text>
      <fieldset className="space-y-2">
        <legend>Supported selection styles</legend>
        {Object.entries(styleNames).map(([key, label]) => (
          <label className="block" key={key}>
            <input
              type="checkbox"
              checked={setup.selection_styles[key as keyof typeof styleNames]}
              onChange={(e) =>
                onChange({
                  ...setup,
                  selection_styles: { ...setup.selection_styles, [key]: e.target.checked },
                })
              }
            />{' '}
            {label}
          </label>
        ))}
      </fieldset>
      <Text size="small">Package and tailored-plan pricing will require a separate approved setup.</Text>
      {Object.entries(methodNames).map(([key, label]) => {
        const method = key as keyof typeof methodNames;
        const schedule = setup.methods[method];
        const change = (next: typeof schedule) =>
          onChange({ ...setup, methods: { ...setup.methods, [method]: next } });
        return (
          <details key={key} className="rounded border p-3">
            <summary>{label} setup</summary>
            <div className="mt-3 space-y-3">
              <label className="block">
                <input
                  type="checkbox"
                  aria-label={`Enable ${label}`}
                  checked={schedule.enabled}
                  onChange={(e) => change({ ...schedule, enabled: e.target.checked })}
                />{' '}
                Enable {label} in draft setup
              </label>
              <Text size="small">
                Proposed windows use your Availability timezone. They do not offer customer times, override
                global time off, or reserve chef work.
              </Text>
              {dayNames.map((day, i) => {
                const dayKey = String(i + 1) as '1';
                const hours = schedule.weekly[dayKey];
                return (
                  <div key={day} className="space-y-2">
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`${label} ${day}`}
                        checked={hours !== undefined}
                        onChange={(e) => {
                          const weekly = { ...schedule.weekly };
                          if (e.target.checked) weekly[dayKey] = [{ start: '', end: '' }];
                          else delete weekly[dayKey];
                          change({ ...schedule, weekly });
                        }}
                      />{' '}
                      {day}
                    </label>
                    {hours && (
                      <HoursEditor
                        label={`${label} ${day}`}
                        value={hours}
                        onChange={(hours) =>
                          change({ ...schedule, weekly: { ...schedule.weekly, [dayKey]: hours } })
                        }
                      />
                    )}
                  </div>
                );
              })}
              <MethodDates
                label={label}
                dates={schedule.dates}
                onChange={(dates) => change({ ...schedule, dates })}
              />
            </div>
          </details>
        );
      })}
      <details className="rounded border p-3">
        <summary>Delivery area drafts</summary>
        <div className="mt-3 space-y-3">
          <Text size="small">
            Delivery within the chef’s approved area is free. Radius and ZIP inputs are saved for review; they
            are not active eligibility rules. Combining them, address verification and out-of-area handling
            still need decisions.
          </Text>
          <label className="block">
            <input
              type="checkbox"
              checked={setup.delivery_area.radius !== null}
              onChange={(e) =>
                onChange({
                  ...setup,
                  delivery_area: {
                    ...setup.delivery_area,
                    radius: e.target.checked ? { address: '', distance: 0, unit: 'mi' } : null,
                  },
                })
              }
            />{' '}
            Draft radius around an address
          </label>
          {setup.delivery_area.radius && (
            <div className="space-y-2">
              <label className="block">
                Radius center address
                <Input
                  value={setup.delivery_area.radius.address}
                  onChange={(e) =>
                    onChange({
                      ...setup,
                      delivery_area: {
                        ...setup.delivery_area,
                        radius: { ...setup.delivery_area.radius!, address: e.target.value },
                      },
                    })
                  }
                />
              </label>
              <label className="block">
                Radius distance
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={setup.delivery_area.radius.distance || ''}
                  onChange={(e) =>
                    onChange({
                      ...setup,
                      delivery_area: {
                        ...setup.delivery_area,
                        radius: { ...setup.delivery_area.radius!, distance: Number(e.target.value) },
                      },
                    })
                  }
                />
              </label>
              <label className="block">
                Radius unit
                <select
                  value={setup.delivery_area.radius.unit}
                  onChange={(e) =>
                    onChange({
                      ...setup,
                      delivery_area: {
                        ...setup.delivery_area,
                        radius: { ...setup.delivery_area.radius!, unit: e.target.value as 'mi' | 'km' },
                      },
                    })
                  }
                >
                  <option value="mi">Miles</option>
                  <option value="km">Kilometers</option>
                </select>
              </label>
            </div>
          )}
          <label className="block">
            ZIP codes (one per line or separated by commas)
            <textarea
              className="block w-full rounded border p-2"
              value={setup.delivery_area.zip_codes.join(', ')}
              onChange={(e) =>
                onChange({
                  ...setup,
                  delivery_area: {
                    ...setup.delivery_area,
                    zip_codes: e.target.value ? e.target.value.split(/[\n,]/).map((v) => v.trim()) : [],
                  },
                })
              }
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onChange({ ...setup, delivery_area: { ...setup.delivery_area, zip_codes: [] } })}
          >
            Clear ZIP codes
          </Button>
        </div>
      </details>
      <details className="rounded border p-3">
        <summary>Chef work planning</summary>
        <div className="mt-3 space-y-3">
          <Text>
            Plan actual preparation, travel, cooking or handoff time explicitly. These drafts do not create
            reservations. Activating work plans requires a later approval workflow and conflict check. A
            pickup window does not create an exclusive appointment.
          </Text>
          {setup.work_plans.map((plan, i) => {
            const patch = (values: Partial<typeof plan>) =>
              onChange({
                ...setup,
                work_plans: setup.work_plans.map((p, j) => (j === i ? { ...p, ...values } : p)),
              });
            return (
              <fieldset className="space-y-2 rounded border p-2" key={plan.id}>
                <legend>Draft work {i + 1}</legend>
                <label className="block">
                  Purpose
                  <select
                    value={plan.purpose}
                    onChange={(e) => patch({ purpose: e.target.value as typeof plan.purpose })}
                  >
                    <option value="in_home">In-home cooking</option>
                    <option value="preparation">Preparation</option>
                    <option value="delivery">Delivery / travel</option>
                    <option value="handoff">Handoff</option>
                  </select>
                </label>
                <label className="block">
                  Start (UTC)
                  <Input
                    type="datetime-local"
                    step={1}
                    value={
                      Number.isFinite(Date.parse(plan.start))
                        ? new Date(plan.start).toISOString().slice(0, 19)
                        : ''
                    }
                    onChange={(e) =>
                      patch({ start: e.target.value ? new Date(`${e.target.value}Z`).toISOString() : '' })
                    }
                  />
                </label>
                <label className="block">
                  End (UTC)
                  <Input
                    type="datetime-local"
                    step={1}
                    value={
                      Number.isFinite(Date.parse(plan.end))
                        ? new Date(plan.end).toISOString().slice(0, 19)
                        : ''
                    }
                    onChange={(e) =>
                      patch({ end: e.target.value ? new Date(`${e.target.value}Z`).toISOString() : '' })
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    onChange({ ...setup, work_plans: setup.work_plans.filter((_, j) => j !== i) })
                  }
                >
                  Remove draft work {i + 1}
                </Button>
              </fieldset>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              onChange({
                ...setup,
                work_plans: [
                  ...setup.work_plans,
                  { id: crypto.randomUUID(), purpose: 'preparation', start: '', end: '' },
                ],
              })
            }
          >
            Add draft work
          </Button>
        </div>
      </details>
      {!validation.success && (
        <Text role="alert" className="text-ui-fg-error">
          {validation.error.issues.map((i) => `${i.path.join(' / ')}: ${i.message}`).join(' ')}
        </Text>
      )}
      <WorkReview />
    </Container>
  );
}

function MethodDates({
  label,
  dates,
  onChange,
}: {
  label: string;
  dates: MealPrepSetup['methods']['pickup']['dates'];
  onChange: (value: typeof dates) => void;
}) {
  const [date, setDate] = useState('');
  return (
    <div className="space-y-2">
      <Text>Proposed dated windows (no closure precedence is applied)</Text>
      {Object.entries(dates).map(([date, hours]) => (
        <div key={date} className="rounded border p-2">
          <Text>{date}</Text>
          {!hours.length && <Text size="small">No proposed windows on this date.</Text>}
          <HoursEditor
            label={`${label} ${date}`}
            value={hours}
            onChange={(hours) => onChange({ ...dates, [date]: hours })}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const next = { ...dates };
              delete next[date];
              onChange(next);
            }}
          >
            Remove {label} date {date}
          </Button>
        </div>
      ))}
      <label className="block">
        {label} proposed date
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <Button
        type="button"
        variant="secondary"
        disabled={!date || date in dates}
        onClick={() => {
          onChange({ ...dates, [date]: [] });
          setDate('');
        }}
      >
        Add {label} date
      </Button>
    </div>
  );
}

function WorkReview() {
  const [date, setDate] = useState('');
  const [result, setResult] = useState<MealPrepWorkReview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  return (
    <details className="rounded border p-3">
      <summary>Chef review: work, orders and servings</summary>
      <div className="mt-3 space-y-3">
        <Text>
          Review workload manually. Order and serving totals never limit acceptance. Actual reserved chef work
          still prevents double-booking.
        </Text>
        <Text>
          Order and serving totals are unavailable until approved occurrence menus and orders are implemented.
          Unknown totals are not zero.
        </Text>
        <label className="block">
          Review actual work on date (UTC)
          <Input
            type="date"
            value={date}
            disabled={loading}
            onChange={(e) => {
              setDate(e.target.value);
              setResult(null);
              setError('');
            }}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={!date || loading}
          onClick={async () => {
            setLoading(true);
            setError('');
            setResult(null);
            try {
              const start = `${date}T00:00:00Z`;
              const end = new Date(Date.parse(start) + 86400000).toISOString();
              setResult(await sdk.admin.availability.workReview({ start, end }));
            } catch {
              setError('Unable to load reserved work. Please retry.');
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? 'Loading work…' : 'Review reserved work'}
        </Button>
        {error && <Text role="alert">{error}</Text>}
        {result && (
          <>
            {!result.blocks.length && <Text>No meal-prep work blocks reserved in this interval.</Text>}
            {result.blocks.map((b) => (
              <div key={b.id} className="rounded border p-2">
                <Text>
                  {b.purpose}: {b.start} – {b.end}
                </Text>
                <Text size="small">
                  Linked occurrences: {b.linked_occurrences}. Orders: unavailable. Servings: unavailable.
                </Text>
              </div>
            ))}
          </>
        )}
      </div>
    </details>
  );
}
