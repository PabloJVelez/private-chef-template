/** scrollIntoView also scrolls the overflow-hidden dialog and can hide its header.
 * Move only the conversation log; keep the composer and Admin surface in place.
 */
export function scrollChatTarget(
  target: HTMLElement | null,
  block: "start" | "nearest" = "nearest",
) {
  const log = target?.closest<HTMLElement>(".chef-chat-log");
  if (!target || !log) return;
  const item = target.getBoundingClientRect();
  const view = log.getBoundingClientRect();
  if (block === "start" || item.top < view.top) {
    log.scrollTop += item.top - view.top;
  } else if (item.bottom > view.bottom) {
    log.scrollTop += Math.min(item.top - view.top, item.bottom - view.bottom);
  }
}
