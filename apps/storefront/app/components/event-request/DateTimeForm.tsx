import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { EventRequestFormData } from '@app/routes/request._index';
type Result = {
  timezone: string;
  minDate: string;
  maxDate: string;
  slots: { start: string; time: string; label: string }[];
};
export function DateTimeForm({ className }: { className?: string }) {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<EventRequestFormData>();
  const date = watch('requestedDate'),
    experience = watch('experienceTypeId'),
    selected = watch('slotStart');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setMessage('');
    // Clear stale choices immediately, including when returning to this step.
    setValue('slotStart', '');
    setValue('requestedTime', '');
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
        if (!controller.signal.aborted) {
          setResult(body);
          setMessage(body.slots.length ? '' : 'No available arrival times for this date. Please choose another date.');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setMessage(e.message || 'Availability could not be checked.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, experience, setValue]);
  return (
    <div className={className}>
      <h3 className="mb-2 text-lg font-semibold">Choose the chef arrival time</h3>
      <p className="mb-4">
        Times are shown in the chef’s timezone{result ? ` (${result.timezone})` : ''}. Your request is reviewed before
        payment and does not reserve the slot.
      </p>
      <label className="block mb-4">
        Preferred date
        <input
          className="block w-full rounded border p-3"
          type="date"
          value={date || ''}
          onChange={(e) => setValue('requestedDate', e.target.value, { shouldValidate: true })}
        />
      </label>
      {result && (
        <p className="mb-3 text-sm">
          Booking dates: {result.minDate} through {result.maxDate}.
        </p>
      )}
      <label className="block">
        Available arrival time
        <select
          className="block w-full rounded border p-3"
          value={selected || ''}
          disabled={loading || !result?.slots.length}
          onChange={(e) => {
            const slot = result?.slots.find((s) => s.start === e.target.value);
            setValue('slotStart', slot?.start || '', { shouldValidate: true });
            setValue('requestedTime', slot?.time || '', { shouldValidate: true });
          }}
        >
          <option value="">Select a time…</option>
          {result?.slots.map((s) => (
            <option key={s.start} value={s.start}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <p aria-live="polite" className="mt-3">
        {loading ? 'Checking availability…' : message}
      </p>
      {errors.slotStart && <p role="alert">{errors.slotStart.message}</p>}
      <p className="mt-3 text-sm">
        On-site preparation begins at arrival; dining typically begins about two hours later. Availability is checked
        again on submission and chef approval.
      </p>
    </div>
  );
}
export default DateTimeForm;
