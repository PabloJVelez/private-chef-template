import { Button, Input, Text } from '@medusajs/ui';
import { hoursError, type Hours } from './editor';
export function HoursEditor({
  value,
  onChange,
  label,
}: { value: Hours; onChange: (hours: Hours) => void; label: string }) {
  const error = hoursError(value);
  return (
    <div className="min-w-0 space-y-2">
      {value.map((hours, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            className="!w-32"
            aria-label={`${label} start ${index + 1}`}
            aria-invalid={!!error}
            type="time"
            value={hours.start}
            onChange={(event) =>
              onChange(value.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)))
            }
          />
          <span aria-hidden="true">–</span>
          <Input
            className="!w-32"
            aria-label={`${label} end ${index + 1}`}
            aria-invalid={!!error}
            type="time"
            value={hours.end}
            onChange={(event) =>
              onChange(value.map((item, i) => (i === index ? { ...item, end: event.target.value } : item)))
            }
          />
          <Button
            size="small"
            variant="transparent"
            aria-label={`Remove ${label} period ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remove
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
