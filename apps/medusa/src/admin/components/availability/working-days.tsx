import { Button, Text } from '@medusajs/ui';
import { useState } from 'react';
import type { Settings } from '../../../lib/availability/slots';
import { dayNames } from './editor';
import { HoursEditor } from './hours-editor';
export function WorkingDays({
  settings,
  onChange,
  onCopy,
}: { settings: Settings; onChange: (settings: Settings) => void; onCopy: (day: string) => void }) {
  const [adding, setAdding] = useState(false);
  const configured = Object.keys(settings.weekly)
    .filter((key) => settings.weekly[key as '1']?.length)
    .sort();
  const blank = adding || configured.length === 0;
  const move = (from: string, to: string) => {
    const weekly = { ...settings.weekly };
    const hours = from ? weekly[from as '1'] : [{ start: '', end: '' }];
    if (from) delete weekly[from as '1'];
    weekly[to as '1'] = hours!;
    onChange({ ...settings, weekly });
    setAdding(false);
  };
  return (
    <div className="space-y-3">
      <Text size="small" className="text-ui-fg-subtle">
        Days not listed are unavailable. Add only the days you work.
      </Text>
      <div className="divide-y">
        {[...configured, ...(blank ? [''] : [])].map((day) => (
          <div key={day || 'new'} className="grid gap-3 py-3 md:grid-cols-[160px_1fr_auto]">
            <label className="self-start text-sm">
              Working day
              <select
                aria-label={day ? `Working day ${dayNames[Number(day) - 1]}` : 'New working day'}
                className="mt-1 block w-full rounded border p-2"
                value={day}
                onChange={(e) => move(day, e.target.value)}
              >
                <option value="" disabled>
                  Choose a day
                </option>
                {dayNames.map((name, index) => {
                  const key = String(index + 1);
                  return !configured.includes(key) || key === day ? (
                    <option value={key} key={key}>
                      {name}
                    </option>
                  ) : null;
                })}
              </select>
            </label>
            {day ? (
              <HoursEditor
                label={dayNames[Number(day) - 1]}
                value={settings.weekly[day as '1'] || []}
                onChange={(hours) => onChange({ ...settings, weekly: { ...settings.weekly, [day]: hours } })}
              />
            ) : (
              <Text size="small" className="self-center text-ui-fg-muted">
                Choose a day, then enter your hours. Nothing is saved yet.
              </Text>
            )}
            <div className="flex flex-wrap gap-1 self-start">
              {day && (
                <Button size="small" variant="transparent" onClick={() => onCopy(day)}>
                  Copy hours
                </Button>
              )}
              {(day || configured.length > 0) && (
                <Button
                  size="small"
                  variant="transparent"
                  aria-label={day ? `Remove ${dayNames[Number(day) - 1]}` : 'Cancel new day'}
                  onClick={() => {
                    if (!day) {
                      setAdding(false);
                      return;
                    }
                    const weekly = { ...settings.weekly };
                    delete weekly[day as '1'];
                    onChange({ ...settings, weekly });
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button
        size="small"
        variant="secondary"
        disabled={blank || configured.length === 7}
        onClick={() => setAdding(true)}
      >
        Add working day
      </Button>
    </div>
  );
}
