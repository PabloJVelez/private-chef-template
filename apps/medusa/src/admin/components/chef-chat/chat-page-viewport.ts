/** Size the routed page and reconcile focus-induced outer scrolling after layout.
 * Safari can pan to the textarea's old position before the keyboard resize lands.
 * Never lock the body or scroll the conversation, and yield to user scrolling.
 */
export function syncChatPageViewport(
  page: HTMLElement,
  composer: HTMLTextAreaElement | null,
) {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  let frame = 0;
  let userScrolled = false;

  const reconcile = () => {
    frame = 0;
    if (
      userScrolled ||
      document.activeElement !== composer ||
      viewport.scale !== 1 ||
      viewport.height <= 0
    )
      return;
    const bounds = page.getBoundingClientRect();
    // When the page genuinely needs document scrolling (tiny landscape or large
    // text), do not pin it to the top and make the composer unreachable.
    if (Math.max(bounds.height, page.scrollHeight) > viewport.height + 1) return;
    const pageTop = window.scrollY + bounds.top;
    const visibleTop = window.scrollY + viewport.offsetTop;
    if (Math.abs(visibleTop - pageTop) > 1)
      window.scrollTo({
        top: pageTop,
        left: window.scrollX,
        behavior: "instant",
      });
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(reconcile);
  };
  const resize = () => {
    if (viewport.scale !== 1 || viewport.height <= 0) return;
    page.style.setProperty("--chef-chat-page-height", `${viewport.height}px`);
    schedule();
  };
  const focus = () => {
    userScrolled = false;
    schedule();
  };
  const userScroll = () => {
    userScrolled = true;
  };
  resize();
  viewport.addEventListener("resize", resize);
  viewport.addEventListener("scroll", schedule);
  window.addEventListener("scroll", schedule);
  window.addEventListener("touchmove", userScroll, { passive: true });
  window.addEventListener("wheel", userScroll, { passive: true });
  composer?.addEventListener("focus", focus);
  return () => {
    window.cancelAnimationFrame(frame);
    viewport.removeEventListener("resize", resize);
    viewport.removeEventListener("scroll", schedule);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("touchmove", userScroll);
    window.removeEventListener("wheel", userScroll);
    composer?.removeEventListener("focus", focus);
    page.style.removeProperty("--chef-chat-page-height");
  };
}
