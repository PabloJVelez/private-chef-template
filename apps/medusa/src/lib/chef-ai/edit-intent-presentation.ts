import type { EditIntent } from "./edit-intent";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const ordinal = (day: number) =>
  `${day}${day % 100 >= 11 && day % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] || "th"}`;

/** Present only captured proposed fields. No clock, browser zone, targetDate,
 * event-month inference, parsing user prose, or normalization into a command.
 */
export function formatProposedEdit(
  intent: Pick<EditIntent, "date" | "time">,
): string {
  const parts: string[] = [];
  const d = intent.date;
  if (d) {
    let date: string;
    switch (d.kind) {
      case "day_of_month":
        date = ordinal(d.day);
        break;
      case "iso": {
        const [year, month, day] = d.value.split("-").map(Number);
        date = months[month - 1]
          ? `${months[month - 1]} ${day}, ${year}`
          : d.value;
        break;
      }
      case "month_day":
        date = `${months[d.month - 1]} ${d.day}${d.year === null ? "" : `, ${d.year}`}`;
        break;
      case "relative_day":
        date =
          d.offset === 0
            ? "Today"
            : d.offset === 1
              ? "Tomorrow"
              : d.offset === -1
                ? "Yesterday"
                : d.offset > 0
                  ? `In ${d.offset} days`
                  : `${-d.offset} days ago`;
        break;
    }
    parts.push(`Proposed date: ${date}`);
  }
  if (intent.time) {
    const [hour, minute] = intent.time.split(":").map(Number);
    parts.push(
      `Proposed time: ${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`,
    );
  }
  return parts.join(" · ") || "New date/time not captured";
}
