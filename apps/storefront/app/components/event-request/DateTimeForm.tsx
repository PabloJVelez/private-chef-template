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
          setValue('slotLabel', retained.label);
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
        if (!controller.signal.aborted) setMessage('Arrival times could not be checked. Retry before continuing.');
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
      <p className="mb-4">
        Times are shown in the chef’s timezone{current ? ` (${current.timezone})` : ''}. Your request is reviewed before
        payment and does not reserve the slot.
      </p>
      <AvailabilityCalendar
        experienceId={experience || ''}
        selected={date || ''}
        onSelect={(next) => {
          if (next !== date) {
            setValue('slotStart', '');
            setValue('requestedTime', '');
            setValue('slotLabel', '');
            setValue('slotValidated', false);
          }
          setValue('requestedDate', next, { shouldValidate: true });
        }}
      />
      {date && <p className="mb-3">Selected date: {date}</p>}
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
            setValue('slotLabel', slot?.label || '');
            setValue('slotTimezone', current?.timezone || '');
            setValue('slotValidated', !!slot);
          }}
        >
          <option value="">Select a time…</option>
          {current?.slots.map((slot) => (
            <option key={slot.start} value={slot.start}>
              {slot.label}
            </option>
          ))}
        </select>
      </label>
      <p aria-live="polite" className="mt-3">
        {loading ? 'Checking arrival times…' : message}
      </p>
      {date && experience && (
        <button
          type="button"
          className="mt-2 underline"
          disabled={loading}
          onClick={() => setRetry((value) => value + 1)}
        >
          Refresh arrival times
        </button>
      )}
      {errors.slotStart && <p role="alert">{errors.slotStart.message}</p>}
      <p className="mt-3 text-sm">
        Your selected experience’s duration, preparation, travel and cleanup are included when checking availability.
        Times are checked again on submission and chef approval.
      </p>
    </div>
  );
}
export default DateTimeForm;
