import type { Settings } from '../../../lib/availability/slots';
import { WeeklyHours } from './weekly-hours';

export function WorkingDays({
  settings,
  onChange,
  onEditing,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onEditing: (editing: boolean) => void;
}) {
  return (
    <WeeklyHours
      weekly={settings.weekly}
      onChange={(weekly) => onChange({ ...settings, weekly })}
      onEditing={onEditing}
    />
  );
}
