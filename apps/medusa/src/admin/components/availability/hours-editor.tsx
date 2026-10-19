import { XMark } from '@medusajs/icons';
import { Button, IconButton, Input, Text } from '@medusajs/ui';
import { useId } from 'react';
import { hoursError, type Hours } from './editor';
export function HoursEditor({
  value,
  onChange,
  label,
  compact = false,
}: { value: Hours; onChange: (hours: Hours) => void; label: string; compact?: boolean }) {
  const error = hoursError(value);
  const errorId = useId();
  return (
    <div className={`w-full min-w-0 space-y-2 ${compact ? '' : 'max-w-lg'}`}>
      {value.map((hours, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-2">
          <label className="min-w-0 text-sm leading-5">
            <span className={compact ? 'mb-1 block md:sr-only' : 'mb-1 block'}>Start</span>
            <Input
              className="w-full min-w-0"
              aria-label={`${label} start ${index + 1}`}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              type="time"
              value={hours.start}
              onChange={(event) =>
                onChange(value.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)))
              }
            />
          </label>
          <label className="min-w-0 text-sm leading-5">
            <span className={compact ? 'mb-1 block md:sr-only' : 'mb-1 block'}>End</span>
            <Input
              className="w-full min-w-0"
              aria-label={`${label} end ${index + 1}`}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              type="time"
              value={hours.end}
              onChange={(event) =>
                onChange(value.map((item, i) => (i === index ? { ...item, end: event.target.value } : item)))
              }
            />
          </label>
          {value.length > 1 && (
            <IconButton
              type="button"
              size="small"
              variant="transparent"
              aria-label={`Remove ${label} time range ${index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <XMark aria-hidden="true" />
            </IconButton>
          )}
        </div>
      ))}
      {error && (
        <Text id={errorId} size="small" className="text-ui-fg-error" role="alert">
          {error}
        </Text>
      )}
      {!compact && (
        <Button
          type="button"
          size="small"
          variant="secondary"
          disabled={value.length >= 12}
          onClick={() => onChange([...value, { start: '', end: '' }])}
        >
          Add another time range
        </Button>
      )}
    </div>
  );
}
