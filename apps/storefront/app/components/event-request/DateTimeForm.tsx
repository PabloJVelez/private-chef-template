import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { EventRequestFormData } from '@app/routes/request._index';
import { AvailabilityCalendar } from './AvailabilityCalendar';
type Result = {
  date: string;
  experienceId: string;
  timezone: string;
  minDate: string;
  maxDate: string;
  slots: { start: string; time: string; label: string }[];
};
// Keep repeated DST wall-clock times distinct without displaying timezone details.
export function arrivalLabel(slot: Result['slots'][number], slots: Result['slots']) {
  const [hour, minute] = slot.time.split(':').map(Number);
  const label = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  const repeated = slots.filter((item) => item.time === slot.time).sort((a, b) => a.start.localeCompare(b.start));
  return repeated.length > 1
    ? `${label} (${repeated.findIndex((item) => item.start === slot.start) + 1} of ${repeated.length})`
    : label;
}
export function DateTimeForm({ className }: { className?: string }) {
  const {
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<EventRequestFormData>();
  const date = watch('requestedDate'),
    experience = watch('experienceTypeId'),
    selected = watch('slotStart');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setMessage('');
    setValue('slotValidated', false);
    if (!date || !experience) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/availability?${new URLSearchParams({ date, experience_id: experience })}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        return body as Result;
      })
      .then((body) => {
        if (controller.signal.aborted || body.date !== date || body.experienceId !== experience) return;
        setResult(body);
        const previous = getValues('slotStart');
        const retained = body.slots.find((slot) => slot.start === previous);
        if (retained) {
          setValue('requestedTime', retained.time);
          setValue('slotLabel', arrivalLabel(retained, body.slots));
          setValue('slotTimezone', body.timezone);
          setValue('slotValidated', true);
        } else {
          setValue('slotStart', '');
          setValue('requestedTime', '');
          setValue('slotLabel', '');
          setValue('slotTimezone', body.timezone);
          setMessage(
            previous
              ? 'Your previous time is no longer available. Choose another arrival time.'
              : body.slots.length
                ? ''
                : 'No available arrival times for this date. Refresh dates or choose another date.',
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage('Arrival times could not be checked. Use Refresh dates to try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, experience, getValues, setValue, retry]);
  const current = result?.date === date && result?.experienceId === experience ? result : null;
  return (
    <div className={className}>
      <h3 className="mb-2 text-lg font-semibold">Choose the chef arrival time</h3>
      <p className="mb-4">Your request is reviewed before payment and does not reserve the slot.</p>
      <AvailabilityCalendar
        experienceId={experience || ''}
        selected={date || ''}
        onRefresh={() => {
          setValue('slotValidated', false);
          setRetry((value) => value + 1);
        }}
        onSelect={(next) => {
          setValue('slotValidated', false);
          setRetry((value) => value + 1);
          if (next !== date) {
            setValue('slotStart', '');
            setValue('requestedTime', '');
            setValue('slotLabel', '');
            setValue('slotValidated', false);
          }
          setValue('requestedDate', next, { shouldValidate: true });
        }}
      />
      <label className="block">
        Available arrival time
        <select
          className="block w-full rounded border p-3"
          value={current ? selected || '' : ''}
          disabled={loading || !current?.slots.length}
          onChange={(event) => {
            const slot = current?.slots.find((item) => item.start === event.target.value);
            setValue('slotStart', slot?.start || '', { shouldValidate: true });
            setValue('requestedTime', slot?.time || '', { shouldValidate: true });
            setValue('slotLabel', slot && current ? arrivalLabel(slot, current.slots) : '');
            setValue('slotTimezone', current?.timezone || '');
            setValue('slotValidated', !!slot);
          }}
        >
          <option value="">Select a time…</option>
          {current?.slots.map((slot) => (
            <option key={slot.start} value={slot.start}>
              {arrivalLabel(slot, current.slots)}
            </option>
          ))}
        </select>
      </label>
      <p aria-live="polite" className="mt-3">
        {loading ? 'Checking arrival times…' : message}
      </p>
      {errors.slotStart && <p role="alert">{errors.slotStart.message}</p>}
    </div>
  );
}
export default DateTimeForm;
