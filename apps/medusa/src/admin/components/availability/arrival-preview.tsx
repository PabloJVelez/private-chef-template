import { Button, Heading, Input, Text } from '@medusajs/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { HelpTip } from './help-tip';
import { sdk } from '../../../sdk';
export function ArrivalPreview({
  configured,
  dirty,
  revision,
}: { configured: boolean; dirty: boolean; revision: number }) {
  const [experience, setExperience] = useState('');
  const [date, setDate] = useState('');
  const experiences = useQuery({
    queryKey: ['availability-experiences'],
    queryFn: () => sdk.admin.experienceTypes.list(),
  });
  const preview = useQuery({
    queryKey: ['availability-preview', date, experience, revision],
    queryFn: () => sdk.admin.availability.preview(date, experience),
    enabled: configured && !!date && !!experience,
    retry: false,
  });
  const selected = configured && !!date && !!experience;
  // Query keys isolate late responses. Do not show cached slots while revalidating.
  const result =
    !preview.isFetching && !preview.isError && preview.data?.date === date && preview.data?.experienceId === experience
      ? preview.data
      : undefined;
  return (
    <section className="space-y-3" aria-labelledby="preview-heading">
      <div className="flex items-center gap-1">
        <Heading level="h2" id="preview-heading">
          What clients can request
        </Heading>
        <HelpTip
          label="About arrival-time preview"
          content="Includes saved hours, accepted bookings, your calendar choice, and the experience’s length, travel and preparation time."
        />
      </div>
      <Text size="small" weight="plus">
        Client arrival times · saved schedule
      </Text>
      {dirty && (
        <Text size="small" role="status">
          Your draft is not live. Save to update this preview.
        </Text>
      )}
      {!configured && <Text>Save your first schedule to preview arrival times.</Text>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm">
          Experience
          <select
            className="mt-1 block w-full rounded border p-2"
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
          >
            <option value="">Choose an experience</option>
            {experiences.data?.experience_types
              .filter((e) => e.is_active)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Date
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <Button
          size="small"
          variant="secondary"
          disabled={!selected || preview.isFetching}
          onClick={() => preview.refetch()}
        >
          Refresh
        </Button>
      </div>
      {experiences.isError && (
        <Text role="alert">
          Could not load experiences.{' '}
          <button className="underline" onClick={() => experiences.refetch()}>
            Retry
          </button>
        </Text>
      )}
      {!experiences.isLoading &&
        !experiences.isError &&
        !experiences.data?.experience_types.some((e) => e.is_active) && (
          <Text>No active experiences. Add one in Experiences to preview times.</Text>
        )}
      <div aria-live="polite" aria-busy={selected && preview.isFetching}>
        {selected && preview.isFetching && <Text>Checking arrival times…</Text>}
        {selected && preview.isError && (
          <Text role="alert" className="text-ui-fg-error">
            Could not check availability. Check your saved schedule and Google connection, then refresh. This does not
            mean the day is free.
          </Text>
        )}
        {result && (
          <>
            <Text size="small" className="mb-2 text-ui-fg-muted">
              {result.date} · {result.timezone}
            </Text>
            {result.slots.length ? (
              <ul className="flex flex-wrap gap-2">
                {result.slots.map((slot) => (
                  <li className="rounded border px-3 py-1 text-sm" key={slot.start}>
                    {slot.label}
                  </li>
                ))}
              </ul>
            ) : (
              <Text>
                No arrival times available for this experience on this date. Check hours, booking notice and experience
                length.
              </Text>
            )}
          </>
        )}
      </div>
    </section>
  );
}
