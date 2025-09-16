import { DateTime } from "luxon"
import { luxonLocalizer } from "react-big-calendar"

/**
 * firstDayOfWeek:
 * 0 = Sunday (Google default), 1 = Monday
 */
export const localizer = luxonLocalizer(DateTime, { firstDayOfWeek: 0 })

