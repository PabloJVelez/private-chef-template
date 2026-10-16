import { Button, Input, Text } from '@medusajs/ui';
import { hoursError, type Hours } from './editor';
export function HoursEditor({
  value,
  onChange,
  label,
}: { value: Hours; onChange: (hours: Hours) => void; label: string }) {
  const error = hoursError(value);
  return (
    <div className="w-full min-w-0 max-w-[25rem] space-y-2">
      {value.map((hours, index) => (
        <div key={index} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="min-w-0 text-sm leading-5">
            <span className="mb-1 block">Start</span>
            <Input
              className="w-full min-w-0"
              aria-label={`${label} start ${index + 1}`}
              aria-invalid={!!error}
              type="time"
              value={hours.start}
              onChange={(event) =>
                onChange(value.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)))
              }
            />
          </label>
          <label className="min-w-0 text-sm leading-5">
            <span className="mb-1 block">End</span>
            <Input
              className="w-full min-w-0"
              aria-label={`${label} end ${index + 1}`}
              aria-invalid={!!error}
              type="time"
              value={hours.end}
              onChange={(event) =>
                onChange(value.map((item, i) => (i === index ? { ...item, end: event.target.value } : item)))
              }
            />
          </label>
          <Button
            size="small"
            variant="transparent"
            className="col-span-2 justify-self-start sm:col-span-1"
            aria-label={`Remove ${label} period ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remove period
          </Button>
        </div>
      ))}
      {error && (
        <Text size="small" className="text-ui-fg-error" role="alert">
          {error}
        </Text>
      )}
      <Button
        size="small"
        variant="transparent"
        disabled={value.length >= 12}
        onClick={() => onChange([...value, { start: '', end: '' }])}
      >
        + Add a period
      </Button>
    </div>
  );
}
