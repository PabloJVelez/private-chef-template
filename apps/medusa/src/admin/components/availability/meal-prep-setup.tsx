import { Badge, Button, Checkbox, Container, Heading, Label, Switch, Text } from '@medusajs/ui';
import type { ReactNode } from 'react';
import { emptyMealPrepSetup, mealPrepSetupSchema, type MealPrepSetup } from '../../../lib/availability/slots';
import { SettingsDrawer } from './settings-drawer';
import { DeliveryAreaFields } from './delivery-area-fields';

const methodNames = { in_home: 'In-home cooking', delivery: 'Delivery', pickup: 'Pickup' } as const;
const styleNames = {
  individual_dishes: 'Individual dishes and quantities',
  package: 'Packages',
  chosen_menu: 'Chosen-menu visit',
  tailored_plan: 'Tailored-plan request',
} as const;
const fieldError = (field: keyof MealPrepSetup, value: unknown) => {
  const parsed = mealPrepSetupSchema.shape[field].safeParse(value);
  return parsed.success ? '' : [...new Set(parsed.error.issues.map((issue) => issue.message))].join(' ');
};

function SettingRow({ label, summary, children }: { label: string; summary: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="min-w-0 space-y-1">
        <Text size="small" weight="plus">
          {label}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {summary}
        </Text>
      </div>
      {children}
    </div>
  );
}

export function MealPrepSetupEditor({
  value,
  onChange,
  onEditing,
  disabled = false,
  onViewAvailability,
}: {
  value: MealPrepSetup | null | undefined;
  onChange: (value: MealPrepSetup) => void;
  onEditing: (editing: boolean) => void;
  disabled?: boolean;
  onViewAvailability: () => void;
}) {
  const setup = value ?? emptyMealPrepSetup();
  const styles = Object.entries(styleNames)
    .filter(([key]) => setup.selection_styles[key as keyof typeof styleNames])
    .map(([, label]) => label);
  const hasArea = !!setup.delivery_area.radius || !!setup.delivery_area.zip_codes.length;
  const areaSummary = [
    setup.delivery_area.radius && `${setup.delivery_area.radius.distance} ${setup.delivery_area.radius.unit} radius`,
    setup.delivery_area.zip_codes.length &&
      `${setup.delivery_area.zip_codes.length} ZIP code${setup.delivery_area.zip_codes.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text size="small" className="text-ui-fg-subtle">
          Working hours and time off are shared with private events.
        </Text>
        <Button type="button" size="small" variant="transparent" onClick={onViewAvailability}>
          View shared availability
        </Button>
      </div>
      <Container className="divide-y divide-ui-border-base p-0">
        <div className="flex items-start justify-between gap-4 px-6 py-4">
          <div>
            <Heading level="h2">Meal Prep</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Choose how you offer meal prep. These preferences are not live yet.
            </Text>
          </div>
          <Badge size="2xsmall" color="orange">
            Draft
          </Badge>
        </div>
        <fieldset className="divide-y divide-ui-border-base">
          <legend className="sr-only">Service methods</legend>
          {Object.entries(methodNames).map(([key, label]) => {
            const method = key as keyof typeof methodNames;
            return (
              <div className="flex items-center justify-between gap-4 px-6 py-4" key={method}>
                <Label htmlFor={`meal-method-${method}`}>{label}</Label>
                <Switch
                  id={`meal-method-${method}`}
                  aria-label={`Enable ${label}`}
                  checked={setup.methods[method].enabled}
                  onCheckedChange={(enabled) =>
                    onChange({
                      ...setup,
                      methods: { ...setup.methods, [method]: { ...setup.methods[method], enabled } },
                    })
                  }
                />
              </div>
            );
          })}
        </fieldset>
        <SettingRow label="Menu choices" summary={styles.length ? styles.join(', ') : 'Not selected'}>
          <SettingsDrawer
            title="Menu choices"
            description="Choose the ways customers can select their meals."
            value={setup.selection_styles}
            disabled={disabled}
            onEditing={onEditing}
            validate={(value) => fieldError('selection_styles', value)}
            onApply={(selection_styles) => onChange({ ...setup, selection_styles })}
          >
            {(selection, change) => (
              <div className="space-y-4">
                {Object.entries(styleNames).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3">
                    <Checkbox
                      id={`meal-style-${key}`}
                      checked={selection[key as keyof typeof styleNames]}
                      onCheckedChange={(checked) => change({ ...selection, [key]: checked === true })}
                    />
                    <Label htmlFor={`meal-style-${key}`}>{label}</Label>
                  </div>
                ))}
                <Text size="small" className="text-ui-fg-subtle">
                  Package and tailored-plan pricing needs a separate setup.
                </Text>
              </div>
            )}
          </SettingsDrawer>
        </SettingRow>
        {(setup.methods.delivery.enabled || hasArea) && (
          <SettingRow label="Delivery area" summary={areaSummary || 'Not configured'}>
            <SettingsDrawer
              title="Delivery area"
              description="Save an area for your delivery service."
              value={setup.delivery_area}
              disabled={disabled}
              onEditing={onEditing}
              validate={(value) => fieldError('delivery_area', value)}
              onApply={(delivery_area) => onChange({ ...setup, delivery_area })}
            >
              {(delivery_area, change) => <DeliveryAreaFields value={delivery_area} onChange={change} />}
            </SettingsDrawer>
          </SettingRow>
        )}
      </Container>
    </div>
  );
}
