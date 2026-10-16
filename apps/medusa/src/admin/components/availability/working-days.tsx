import { Button, Text } from '@medusajs/ui';
import { useState } from 'react';
import type { Settings } from '../../../lib/availability/slots';
import { dayNames } from './editor';
import { HoursEditor } from './hours-editor';
import { HelpTip } from './help-tip';
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
        Days not listed are unavailable.
      </Text>
      <div className="divide-y">
        {[...configured, ...(blank ? [''] : [])].map((day) => (
          <div key={day || 'new'} className="grid items-start gap-3 py-4 xl:grid-cols-[10rem_25rem_auto] xl:gap-4">
            <label className="block max-w-40 text-sm leading-5">
              <span className="mb-1 block">Working day</span>
              <select
                aria-label={day ? `Working day ${dayNames[Number(day) - 1]}` : 'New working day'}
                className="block h-8 w-full rounded border border-ui-border-base bg-ui-bg-field px-2 py-1 text-ui-fg-base"
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
              <Text size="small" className="self-start text-ui-fg-muted xl:pt-6">
                Choose a working day to add hours.
              </Text>
            )}
            <div className="flex flex-wrap items-center gap-1 xl:pt-6">
              {day && (
                <Button size="small" variant="transparent" onClick={() => onCopy(day)}>
                  Copy hours
                </Button>
              )}
              {(day || configured.length > 0) && (
                <Button
                  size="small"
                  variant="transparent"
                  aria-label={day ? `Remove ${dayNames[Number(day) - 1]} working day` : 'Cancel new day'}
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
                  {day ? 'Remove day' : 'Cancel'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="small"
          variant="secondary"
          disabled={blank || configured.length === 7}
          onClick={() => setAdding(true)}
        >
          Add working day
        </Button>
        <HelpTip
          label="About adding working days"
          content="Add only the days you work, then enter your hours. New hours start blank. Save availability to publish your changes."
        />
      </div>
    </div>
  );
}
