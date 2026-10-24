import { EllipsisHorizontal } from '@medusajs/icons';
import { Button, DropdownMenu, IconButton, Text } from '@medusajs/ui';
import { useEffect, useRef, useState } from 'react';
import type { Settings } from '../../../lib/availability/slots';
import { addWorkingDays, copyDays, dayNames, type Hours } from './editor';
import { HoursEditor } from './hours-editor';
import { HelpTip } from './help-tip';

export function WorkingDays({
  settings,
  onChange,
  onEditing,
}: { settings: Settings; onChange: (settings: Settings) => void; onEditing: (editing: boolean) => void }) {
  const [mode, setMode] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [hours, setHours] = useState<Hours>([{ start: '', end: '' }]);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState('');
  const editor = useRef<HTMLFieldSetElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const openingEditor = useRef(false);
  const removedDay = useRef(false);
  const configured = Object.keys(settings.weekly)
    .filter((key) => settings.weekly[key as '1']?.length)
    .sort();
  const daysKey = configured.join(',');
  useEffect(() => {
    if (removedDay.current) {
      addButton.current?.focus();
    } else if (mode) editor.current?.focus();
    else if (returnFocus.current) {
      const target =
        !returnFocus.current.isConnected || returnFocus.current.disabled
          ? Object.values(triggers.current).find((button) => button && !button.disabled)
          : returnFocus.current;
      target?.focus();
    }
  }, [mode, daysKey]);
  const open = (next: string) => {
    returnFocus.current = next === 'add' ? addButton.current : triggers.current[next];
    openingEditor.current = true;
    setTargets([]);
    setHours([{ start: '', end: '' }]);
    setReplace(false);
    setError('');
    setMode(next);
    onEditing(true);
  };
  const close = () => {
    openingEditor.current = false;
    setMode(null);
    onEditing(false);
  };
  const apply = () => {
    try {
      onChange(mode === 'add' ? addWorkingDays(settings, targets, hours) : copyDays(settings, mode!, targets, replace));
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check your days and hours.');
    }
  };
  return (
    <div className="max-w-2xl space-y-3">
      <Text size="small" className="text-ui-fg-subtle">
        Days not listed are unavailable.
      </Text>
      {configured.length ? (
        <div>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[8rem_minmax(0,1fr)] gap-2 pb-2 text-sm text-ui-fg-subtle md:grid"
          >
            <span>Day</span>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem_2rem] gap-2">
              <span>Start</span>
              <span>End</span>
            </div>
          </div>
          <div className="divide-y divide-ui-border-base">
            {configured.map((day) => {
              const name = dayNames[Number(day) - 1];
              const ranges = settings.weekly[day as '1']!;
              return (
                <div
                  key={day}
                  role="group"
                  aria-label={`${name} working hours`}
                  className="grid grid-cols-1 items-start gap-2 py-3 md:grid-cols-[8rem_minmax(0,1fr)]"
                >
                  <Text size="small" weight="plus" className="pt-1">
                    {name}
                  </Text>
                  <div className="min-w-0">
                    <HoursEditor
                      compact
                      actions={
                        <DropdownMenu>
                          <DropdownMenu.Trigger asChild>
                            <IconButton
                              type="button"
                              size="base"
                              variant="primary"
                              disabled={!!mode}
                              ref={(node) => {
                                triggers.current[day] = node;
                              }}
                              aria-label={`Actions for ${name}`}
                            >
                              <EllipsisHorizontal aria-hidden="true" />
                            </IconButton>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Content
                            align="end"
                            className="z-50"
                            onCloseAutoFocus={(event) => {
                              if (openingEditor.current || removedDay.current) event.preventDefault();
                              removedDay.current = false;
                            }}
                          >
                            <DropdownMenu.Item onSelect={() => open(day)}>Copy to other days</DropdownMenu.Item>
                            <DropdownMenu.Item
                              disabled={ranges.length >= 12}
                              onSelect={() =>
                                onChange({
                                  ...settings,
                                  weekly: { ...settings.weekly, [day]: [...ranges, { start: '', end: '' }] },
                                })
                              }
                            >
                              Add another time range
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item
                              onSelect={() => {
                                const weekly = { ...settings.weekly };
                                delete weekly[day as '1'];
                                removedDay.current = true;
                                returnFocus.current = null;
                                onChange({ ...settings, weekly });
                                addButton.current?.focus();
                              }}
                            >
                              Remove day
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu>
                      }
                      label={name}
                      value={ranges}
                      onChange={(next) => onChange({ ...settings, weekly: { ...settings.weekly, [day]: next } })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Text size="small" className="text-ui-fg-muted">
          No working days yet. Add the days you are available.
        </Text>
      )}
      {configured.length < 7 && (
        <div className="flex items-center gap-1">
          <Button
            ref={addButton}
            type="button"
            size="small"
            variant="secondary"
            disabled={!!mode}
            onClick={() => open('add')}
          >
            Add working day
          </Button>
          <HelpTip
            label="About adding working days"
            content="Select one or several days and enter hours once. Each day can be edited independently afterward. Save availability to publish your changes."
          />
        </div>
      )}
      {mode && (
        <fieldset
          ref={editor}
          tabIndex={-1}
          className="space-y-3 rounded-lg border border-ui-border-base p-4 focus:outline-none"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <legend className="px-1 text-sm font-medium">
            {mode === 'add' ? 'Add working days' : `Copy ${dayNames[Number(mode) - 1]}’s hours`}
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {dayNames.map((name, index) => {
              const key = String(index + 1);
              if (mode === 'add' ? configured.includes(key) : mode === key) return null;
              return (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={targets.includes(key)}
                    onChange={(event) => {
                      setTargets(event.target.checked ? [...targets, key] : targets.filter((target) => target !== key));
                      setReplace(false);
                      setError('');
                    }}
                  />
                  {name}
                </label>
              );
            })}
          </div>
          {mode === 'add' ? (
            <HoursEditor label="New working days" value={hours} onChange={setHours} />
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              {settings.weekly[mode as '1']?.map((range) => `${range.start}–${range.end}`).join(', ')}
            </Text>
          )}
          {mode !== 'add' && targets.some((day) => settings.weekly[day as '1']?.length) && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
              Replace existing hours on selected days
            </label>
          )}
          {error && (
            <Text role="alert" size="small" className="text-ui-fg-error">
              {error}
            </Text>
          )}
          <Text size="small" className="text-ui-fg-subtle">
            Apply these changes, then select Save availability to publish them.
          </Text>
          <div className="flex gap-2">
            <Button type="button" size="small" onClick={apply}>
              {mode === 'add' ? 'Apply working days' : 'Apply copy'}
            </Button>
            <Button type="button" size="small" variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
