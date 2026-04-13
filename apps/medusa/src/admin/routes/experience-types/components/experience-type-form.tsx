import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Label, Text } from '@medusajs/ui';
import type {
  AdminCreateExperienceTypeDTO,
  AdminExperienceTypeDTO,
} from '../../../../sdk/admin/admin-experience-types';
import { experienceTypeSchema, getDefaultExperienceTypeValues, to24Hour, type ExperienceTypeFormValues } from '../schemas';

interface ExperienceTypeFormProps {
  initialData?: AdminExperienceTypeDTO;
  onSubmit: (data: AdminCreateExperienceTypeDTO) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const csvToArray = (value?: string) =>
  value
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

function dollarsToCents(dollars: number | null | undefined): number | null {
  if (dollars == null) return null;
  return Math.round(dollars * 100);
}

function hoursToMinutes(hours: number | null | undefined): number | null {
  if (hours == null) return null;
  return Math.round(hours * 60);
}

export const ExperienceTypeForm = ({ initialData, onSubmit, onCancel, isLoading }: ExperienceTypeFormProps) => {
  const form = useForm<ExperienceTypeFormValues>({
    resolver: zodResolver(experienceTypeSchema),
    defaultValues: getDefaultExperienceTypeValues(initialData),
  });

  const handleSubmit = async (values: ExperienceTypeFormValues) => {
    const payload: AdminCreateExperienceTypeDTO = {
      name: values.name,
      slug: values.slug || undefined,
      description: values.description,
      short_description: values.short_description || undefined,
      icon: values.icon || undefined,
      image_url: values.image_url || undefined,
      ideal_for: values.ideal_for || undefined,
      pricing_type: values.pricing_type,
      workflow_event_type: values.workflow_event_type,
      price_per_unit: dollarsToCents(values.price_dollars),
      duration_minutes: hoursToMinutes(values.duration_hours),
      duration_display: values.duration_display || undefined,
      location_type: values.location_type,
      fixed_location_address: values.location_type === 'fixed' ? values.fixed_location_address : null,
      requires_advance_notice: values.requires_advance_notice,
      advance_notice_days: values.requires_advance_notice ? values.advance_notice_days : undefined,
      available_time_slots: csvToArray(values.available_time_slots_input),
      time_slot_start: to24Hour(values.time_slot_start_display ?? '') || undefined,
      time_slot_end: to24Hour(values.time_slot_end_display ?? '') || undefined,
      time_slot_interval_minutes: values.time_slot_interval_minutes,
      min_party_size: values.min_party_size,
      max_party_size: values.max_party_size ?? null,
      is_active: values.is_active,
      is_featured: values.is_featured,
      sort_order: values.sort_order,
      highlights: csvToArray(values.highlights_input),
    };

    await onSubmit(payload);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="p-6 space-y-8">
      <Section title="Basic Info" description="Name, slug, and descriptive fields.">
        <Field label="Name" error={form.formState.errors.name?.message}>
          <Input placeholder="Meal Prep" {...form.register('name')} />
        </Field>

        <Field label="Slug" error={form.formState.errors.slug?.message}>
          <Input placeholder="meal-prep (auto-generated if blank)" {...form.register('slug')} />
        </Field>

        <Field label="Description" error={form.formState.errors.description?.message}>
          <textarea
            className="w-full rounded border px-3 py-2 text-sm"
            rows={3}
            placeholder="Brief description shown to customers"
            {...form.register('description')}
          />
        </Field>

        <Field label="Short Description" error={form.formState.errors.short_description?.message}>
          <Input placeholder="Displayed in cards or summaries" {...form.register('short_description')} />
        </Field>

        <Field label="Ideal For" error={form.formState.errors.ideal_for?.message}>
          <Input placeholder="e.g., Busy families, weekly meal planning" {...form.register('ideal_for')} />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Icon (emoji or URL)" error={form.formState.errors.icon?.message}>
            <Input placeholder="🍽️ or https://..." {...form.register('icon')} />
          </Field>
          <Field label="Image URL" error={form.formState.errors.image_url?.message}>
            <Input placeholder="Hero/cover image" {...form.register('image_url')} />
          </Field>
        </div>
      </Section>

      <Section title="Classification" description="How this experience maps to workflow and pricing categories.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Workflow Event Type" error={form.formState.errors.workflow_event_type?.message}>
            <select className="w-full rounded border px-3 py-2 text-sm" {...form.register('workflow_event_type')}>
              <option value="cooking_class">Cooking Class</option>
              <option value="plated_dinner">Plated Dinner</option>
              <option value="buffet_style">Buffet Style</option>
            </select>
          </Field>

          <Field label="Pricing Type" error={form.formState.errors.pricing_type?.message}>
            <select className="w-full rounded border px-3 py-2 text-sm" {...form.register('pricing_type')}>
              <option value="per_person">Per Person</option>
              <option value="per_item">Per Item</option>
              <option value="product_based">Product Based</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Pricing & Duration" description="Display price and estimated duration for this experience.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Display Price ($)" error={form.formState.errors.price_dollars?.message}>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 149.99"
              {...form.register('price_dollars', { valueAsNumber: true })}
            />
            <Text className="text-ui-fg-subtle text-xs mt-1">Per person display price (optional)</Text>
          </Field>

          <Field label="Duration (hours)" error={form.formState.errors.duration_hours?.message}>
            <Input
              type="number"
              step="0.25"
              min="0"
              placeholder="e.g. 2.5"
              {...form.register('duration_hours', { valueAsNumber: true })}
            />
          </Field>
        </div>

        <Field label="Duration Display Text" error={form.formState.errors.duration_display?.message}>
          <Input placeholder="e.g. ~2.5 hours" {...form.register('duration_display')} />
        </Field>
      </Section>

      <Section title="Location" description="Where the experience happens.">
        <Field label="Location Type" error={form.formState.errors.location_type?.message}>
          <select className="w-full rounded border px-3 py-2 text-sm" {...form.register('location_type')}>
            <option value="customer">Customer Location</option>
            <option value="fixed">Fixed Location</option>
          </select>
        </Field>

        {form.watch('location_type') === 'fixed' && (
          <Field label="Fixed Location Address" error={form.formState.errors.fixed_location_address?.message}>
            <Input placeholder="123 Main St, City, ST" {...form.register('fixed_location_address')} />
          </Field>
        )}
      </Section>

      <Section title="Scheduling" description="Configure advance notice and available time windows.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CheckboxField
            label="Requires Advance Notice"
            description="Enforce lead time before booking."
            registration={form.register('requires_advance_notice')}
          />
          <Field label="Advance Notice (days)" error={form.formState.errors.advance_notice_days?.message}>
            <Input type="number" min={0} {...form.register('advance_notice_days', { valueAsNumber: true })} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Available From" error={form.formState.errors.time_slot_start_display?.message}>
            <Input placeholder="9:00 AM" {...form.register('time_slot_start_display')} />
          </Field>
          <Field label="Available Until" error={form.formState.errors.time_slot_end_display?.message}>
            <Input placeholder="5:00 PM" {...form.register('time_slot_end_display')} />
          </Field>
          <Field label="Interval (minutes)" error={form.formState.errors.time_slot_interval_minutes?.message}>
            <Input type="number" min={5} {...form.register('time_slot_interval_minutes', { valueAsNumber: true })} />
          </Field>
        </div>

        <Field
          label="Explicit Time Slots (comma separated, optional)"
          error={form.formState.errors.available_time_slots_input?.message}
        >
          <Input placeholder="9:00 AM, 9:30 AM, 10:00 AM" {...form.register('available_time_slots_input')} />
        </Field>
      </Section>

      <Section title="Capacity" description="Minimum and maximum party sizes.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Min Party Size" error={form.formState.errors.min_party_size?.message}>
            <Input type="number" min={0} {...form.register('min_party_size', { valueAsNumber: true })} />
          </Field>
          <Field label="Max Party Size" error={form.formState.errors.max_party_size?.message}>
            <Input
              type="number"
              min={0}
              placeholder="Leave empty for no max"
              {...form.register('max_party_size', { valueAsNumber: true })}
            />
          </Field>
        </div>
      </Section>

      <Section title="Highlights" description="Bullets shown in marketing sections.">
        <Field label="Highlights (comma separated)" error={form.formState.errors.highlights_input?.message}>
          <Input
            placeholder="Fresh ingredients, Custom portions, Weekly variety"
            {...form.register('highlights_input')}
          />
        </Field>
      </Section>

      <Section title="Status & Ordering" description="Control visibility and ordering.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <CheckboxField label="Active" description="Visible to customers." registration={form.register('is_active')} />
          <CheckboxField
            label="Featured"
            description="Highlight in storefront."
            registration={form.register('is_featured')}
          />
          <Field label="Sort Order" error={form.formState.errors.sort_order?.message}>
            <Input type="number" {...form.register('sort_order', { valueAsNumber: true })} />
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isLoading}>
          {isLoading ? 'Saving...' : initialData ? 'Update Experience Type' : 'Create Experience Type'}
        </Button>
      </div>
    </form>
  );
};

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
    <div>
      <Text className="font-semibold">{title}</Text>
      {description && <Text className="text-ui-fg-subtle text-sm">{description}</Text>}
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    {children}
    {error && <Text className="text-red-500 text-xs">{error}</Text>}
  </div>
);

const CheckboxField = ({
  label,
  description,
  registration,
}: {
  label: string;
  description?: string;
  registration: UseFormRegisterReturn;
}) => (
  <label className="flex items-start space-x-3 rounded-md border px-3 py-2">
    <input type="checkbox" className="mt-1" {...registration} />
    <div className="space-y-1">
      <Text className="font-medium">{label}</Text>
      {description && <Text className="text-ui-fg-subtle text-sm">{description}</Text>}
    </div>
  </label>
);
