import { Button, Heading, Input, Text } from '@medusajs/ui';
import { useState } from 'react';
import type { Settings } from '../../../lib/availability/slots';
import { applyException, cloneHours, dateRange, type Hours } from './editor';
import { HelpTip } from './help-tip';
import { HoursEditor } from './hours-editor';

type Form = {
  start: string;
  end: string;
  range: boolean;
  kind: 'off' | 'custom';
  hours: Hours;
  original: string | null;
};
export function ExceptionsEditor({
  settings,
  onChange,
  onEditing,
}: { settings: Settings; onChange: (settings: Settings) => void; onEditing: (editing: boolean) => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState('');
  const open = (date = '') => {
    const hours = settings.overrides[date];
    setForm({
      start: date,
      end: date,
      range: false,
      kind: hours?.length ? 'custom' : 'off',
      hours: hours?.length ? cloneHours(hours) : [{ start: '', end: '' }],
      original: hours ? date : null,
    });
    setReplace(false);
    setError('');
    onEditing(true);
  };
  const close = () => {
    setForm(null);
    setError('');
    onEditing(false);
  };
  let dates: string[] = [];
  if (form) {
    try {
      dates = dateRange(form.start, form.range ? form.end : form.start);
    } catch {
      /* Show validation on apply. */
    }
  }
  const overlaps = dates.filter(
    (date) => date in settings.overrides && !(dates.length === 1 && date === form?.original),
  );
  const apply = () => {
    if (!form) return;
    try {
      const selected = dateRange(form.start, form.range ? form.end : form.start);
      if (selected.length === 1 && selected[0] in settings.overrides && form.original !== selected[0]) {
        open(selected[0]);
        setError('This date already has an exception. Its existing hours are open below; review before applying.');
        return;
      }
      if (form.kind === 'custom' && !form.hours.length) throw new Error('Add custom hours or choose Unavailable.');
      onChange(
        applyException(
          settings,
          selected,
          form.kind === 'off' ? [] : form.hours,
          replace || (selected.length === 1 && selected[0] === form.original),
        ),
      );
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check your dates and hours.');
    }
  };
  return (
    <section className="space-y-3" aria-labelledby="exceptions-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Heading id="exceptions-heading" level="h2">
            Days off &amp; special hours
          </Heading>
          <HelpTip
            label="About days off and special hours"
            content="Change a day or a range of dates without changing your usual week. You can save exceptions for up to 366 dates. Applying adds changes to your draft; save availability to publish them."
          />
        </div>
        <Button size="small" variant="secondary" disabled={!!form} onClick={() => open()}>
          Add dates
        </Button>
      </div>
      {form && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              Choose dates
              <select
                className="mt-1 block rounded border p-2"
                value={form.range ? 'range' : 'date'}
                onChange={(e) => {
                  setForm({ ...form, range: e.target.value === 'range' });
                  setReplace(false);
                }}
              >
                <option value="date">One date</option>
                <option value="range">Date range</option>
              </select>
            </label>
            <label className="text-sm">
              {form.range ? 'Start date' : 'Date'}
              <Input
                type="date"
                value={form.start}
                onChange={(e) => {
                  setForm({ ...form, start: e.target.value });
                  setReplace(false);
                }}
              />
            </label>
            {form.range && (
              <label className="text-sm">
                End date
                <Input
                  type="date"
                  value={form.end}
                  onChange={(e) => {
                    setForm({ ...form, end: e.target.value });
                    setReplace(false);
                  }}
                />
              </label>
            )}
          </div>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">Availability for selected dates</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="exception-kind"
                checked={form.kind === 'off'}
                onChange={() => setForm({ ...form, kind: 'off' })}
              />
              Unavailable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="exception-kind"
                checked={form.kind === 'custom'}
                onChange={() => setForm({ ...form, kind: 'custom' })}
              />
              Custom hours
            </label>
          </fieldset>
          {form.kind === 'custom' && (
            <HoursEditor label="Special hours" value={form.hours} onChange={(hours) => setForm({ ...form, hours })} />
          )}
          {overlaps.length > 0 && (
            <label className="block text-sm">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace
              existing exceptions for {overlaps.length} date(s): {overlaps.slice(0, 4).join(', ')}
              {overlaps.length > 4 ? '…' : ''}
            </label>
          )}
          {error && (
            <Text role="alert" className="text-ui-fg-error">
              {error}
            </Text>
          )}
          <div className="flex gap-2">
            <Button size="small" onClick={apply}>
              Apply to draft
            </Button>
            <Button size="small" variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!Object.keys(settings.overrides).length && (
        <Text size="small" className="text-ui-fg-muted">
          No exceptions yet. Your usual week applies every day.
        </Text>
      )}
      <div className="max-h-72 overflow-y-auto divide-y">
        {Object.entries(settings.overrides)
          .sort()
          .map(([date, hours]) => (
            <div className="flex flex-wrap items-center justify-between gap-2 py-2" key={date}>
              <div>
                <Text weight="plus">{date}</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {hours.length ? hours.map((h) => `${h.start}–${h.end}`).join(', ') : 'Unavailable'}
                </Text>
              </div>
              <div className="flex gap-1">
                <Button
                  size="small"
                  variant="transparent"
                  disabled={!!form}
                  onClick={() => open(date)}
                  aria-label={`Edit ${date}`}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  variant="transparent"
                  disabled={!!form}
                  onClick={() => {
                    const overrides = { ...settings.overrides };
                    delete overrides[date];
                    onChange({ ...settings, overrides });
                  }}
                  aria-label={`Use weekly hours for ${date}`}
                >
                  Use weekly hours
                </Button>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
