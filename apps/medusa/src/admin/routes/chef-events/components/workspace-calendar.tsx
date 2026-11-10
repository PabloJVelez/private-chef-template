import { useEffect, useMemo, useRef, useState } from 'react';
// @ts-expect-error FullCalendar 6 ships working require exports but ESM-only declarations; TS 5.7 NodeNext misclassifies this dual package. Vite bundles the import.
import FullCalendar from '@fullcalendar/react';
// @ts-expect-error FullCalendar 6 ships working require exports but ESM-only declarations; TS 5.7 NodeNext misclassifies this dual package. Vite bundles the import.
import dayGridPlugin from '@fullcalendar/daygrid';
// @ts-expect-error FullCalendar 6 ships working require exports but ESM-only declarations; TS 5.7 NodeNext misclassifies this dual package. Vite bundles the import.
import timeGridPlugin from '@fullcalendar/timegrid';
// @ts-expect-error FullCalendar 6 ships working require exports but ESM-only declarations; TS 5.7 NodeNext misclassifies this dual package. Vite bundles the import.
import listPlugin from '@fullcalendar/list';
import { Button, Tooltip } from '@medusajs/ui';
import { ChevronLeft, ChevronRight } from '@medusajs/icons';
import { DateTime } from 'luxon';
import type { DatesSetArg, EventContentArg } from '@fullcalendar/core' with { 'resolution-mode': 'import' };
import type { CalendarEntry } from '../../../../lib/chef-workspace/contracts';
import { AGENDA_DAYS, CALENDAR_VIEWS, workspaceCalendarRange, type CalendarView, type VisibleCalendarRange } from '../../../lib/workspace-calendar-range';
import { workspaceEntryToCalendar, workspaceEntryTooltip } from './event-adapter';
import { eventTypeOptions } from '../schemas';

const plugins = [dayGridPlugin, timeGridPlugin, listPlugin];
const views = { workspaceAgenda: { type: 'list', duration: { days: AGENDA_DAYS } } };
const labels: Record<CalendarView, string> = { month: 'Month', day: 'Day', agenda: 'Agenda' };

function EventContent({ event, timeText, view, onSelectEvent }: EventContentArg & { onSelectEvent: (entry: CalendarEntry) => void }) {
  const entry = event.extendedProps.entry as CalendarEntry;
  const category = eventTypeOptions.find((option) => option.value === entry.category)?.label;
  const content = <>
    <div className="workspace-event-heading"><strong>{timeText}</strong> <span>{entry.title}</span></div>
    <div className="workspace-event-meta">{category && <span>{category} · </span>}{entry.status === 'pending' ? 'Pending request' : entry.status}</div>
  </>;
  return (
    <Tooltip className="chef-workspace-event-tooltip" content={<span className="whitespace-pre-line">{workspaceEntryTooltip(entry)}</span>}>
      {view.type === CALENDAR_VIEWS.agenda ? (
        // Custom list content replaces FullCalendar's default focusable anchor.
        <button type="button" className="workspace-event-content text-left" aria-label={workspaceEntryTooltip(entry)} onClick={(event) => { event.stopPropagation(); onSelectEvent(entry); }}>{content}</button>
      ) : <div className="workspace-event-content">{content}</div>}
    </Tooltip>
  );
}

export function WorkspaceCalendar({ date, view, entries, loading, failed, onNavigate, onRange, onSelectEvent }: {
  date: Date;
  view: CalendarView;
  entries: CalendarEntry[];
  loading: boolean;
  failed: boolean;
  onNavigate: (date: Date, view: CalendarView) => void;
  onRange: (range: VisibleCalendarRange) => void;
  onSelectEvent: (entry: CalendarEntry) => void;
}) {
  const calendar = useRef<FullCalendar>(null);
  const [title, setTitle] = useState('');
  const dateValue = date.getTime();
  const events = useMemo(() => entries.map(workspaceEntryToCalendar), [entries]);
  // URL is authoritative, including browser Back/Forward and external deep links.
  useEffect(() => {
    const api = calendar.current?.getApi();
    if (!api) return;
    if (api.view.type !== CALENDAR_VIEWS[view]) api.changeView(CALENDAR_VIEWS[view], new Date(dateValue));
    else if (api.getDate().getTime() !== dateValue) api.gotoDate(new Date(dateValue));
  }, [dateValue, view]);

  const navigate = (action: 'prev' | 'next' | 'today') => {
    const api = calendar.current?.getApi();
    if (!api) return;
    api[action]();
    onNavigate(api.getDate(), view);
  };
  const emptyMessage = failed ? 'Calendar unavailable.' : loading ? 'Loading events…' : 'No events in this range.';
  return (
    <section className="chef-workspace-calendar" aria-label="Event calendar" aria-busy={loading}>
      <div className="workspace-calendar-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            <Button size="small" variant="secondary" aria-label="Previous" onClick={() => navigate('prev')}><ChevronLeft /></Button>
            <Button size="small" variant="secondary" aria-label="Next" onClick={() => navigate('next')}><ChevronRight /></Button>
          </div>
          <Button size="small" variant="secondary" onClick={() => navigate('today')}>Today</Button>
          <h2 className="text-sm font-medium text-ui-fg-base" aria-live="polite">{title}</h2>
        </div>
        <div className="flex gap-1" role="group" aria-label="Calendar view">
          {(Object.keys(labels) as CalendarView[]).map((next) => (
            <Button key={next} size="small" variant={view === next ? 'secondary' : 'transparent'} aria-pressed={view === next} onClick={() => onNavigate(date, next)}>{labels[next]}</Button>
          ))}
        </div>
      </div>
      <div role="status" className="workspace-calendar-state">{loading || failed || entries.length === 0 ? emptyMessage : `${entries.length} events in this range`}</div>
      <FullCalendar
        ref={calendar}
        plugins={plugins}
        views={views}
        initialView={CALENDAR_VIEWS[view]}
        initialDate={date}
        headerToolbar={false}
        timeZone="local"
        locale="en"
        firstDay={0}
        fixedWeekCount={false}
        height={view === 'day' ? 640 : 'auto'}
        dayMaxEvents={3}
        moreLinkClick="popover"
        dayCellContent={(arg) => arg.dayNumberText ? (
          <button type="button" className="workspace-date-button" aria-label={`Show day for ${DateTime.fromJSDate(arg.date).toFormat('EEEE, MMMM d, yyyy')}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onNavigate(arg.date, 'day'); }}>{arg.dayNumberText}</button>
        ) : null}
        datesSet={(info: DatesSetArg) => { setTitle(info.view.title); onRange(workspaceCalendarRange(info)); }}
        events={events}
        eventContent={(arg) => <EventContent {...arg} onSelectEvent={onSelectEvent} />}
        eventClick={({ event }) => onSelectEvent(event.extendedProps.entry as CalendarEntry)}
        eventInteractive
        eventDidMount={({ el, event }) => el.setAttribute('aria-label', workspaceEntryTooltip(event.extendedProps.entry as CalendarEntry))}
        eventDisplay="block"
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', omitZeroMinute: true, meridiem: 'narrow' }}
        displayEventEnd={view === 'day'}
        editable={false}
        selectable={false}
        defaultTimedEventDuration="00:00:00"
        allDaySlot={false}
        nowIndicator
        scrollTime="08:00:00"
        noEventsContent={emptyMessage}
      />
    </section>
  );
}
