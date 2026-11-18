/** @jest-environment jsdom */
import { syncChatPageViewport } from "../../admin/components/chef-chat/chat-page-viewport";

it("reconciles focus panning after resize, yields to gestures/zoom/short pages, and cleans up", () => {
  const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const viewport = Object.assign(new EventTarget(), {
    height: 700,
    offsetTop: 0,
    scale: 1,
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  const page = document.createElement("main"),
    input = document.createElement("textarea");
  page.append(input);
  document.body.append(page);
  let pageHeight = 700;
  jest
    .spyOn(page, "getBoundingClientRect")
    .mockImplementation(() => ({ top: 0, height: pageHeight }) as DOMRect);
  let queued: FrameRequestCallback | undefined;
  const raf = jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb) => {
      queued = cb;
      return 1;
    });
  const cancel = jest
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation(() => {
      queued = undefined;
    });
  const scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => {
    viewport.offsetTop = 0;
  });
  const flush = () => {
    const cb = queued;
    queued = undefined;
    cb?.(0);
  };
  let cleanup = () => {};
  try {
    cleanup = syncChatPageViewport(page, input);
    flush();
    expect(scroll).not.toHaveBeenCalled();
    input.focus();
    pageHeight = viewport.height = 360;
    viewport.offsetTop = 240;
    viewport.dispatchEvent(new Event("resize"));
    expect(scroll).not.toHaveBeenCalled(); // Let the resized page lay out first.
    flush();
    expect(scroll).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "instant",
    });
    expect(page.style.getPropertyValue("--chef-chat-page-height")).toBe(
      "360px",
    );
    scroll.mockClear();
    viewport.offsetTop = 80;
    viewport.dispatchEvent(new Event("scroll"));
    flush();
    expect(scroll).toHaveBeenCalledTimes(1); // Late Safari pan, after resize.
    scroll.mockClear();
    window.dispatchEvent(new Event("touchmove"));
    viewport.offsetTop = 40;
    viewport.dispatchEvent(new Event("scroll"));
    flush();
    expect(scroll).not.toHaveBeenCalled();
    input.blur();
    input.focus();
    flush();
    expect(scroll).toHaveBeenCalledTimes(1);
    scroll.mockClear();
    viewport.scale = 2;
    viewport.offsetTop = 80;
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
    flush();
    expect(scroll).not.toHaveBeenCalled();
    viewport.scale = 1;
    viewport.height = 60;
    pageHeight = 180;
    viewport.dispatchEvent(new Event("resize"));
    flush();
    expect(scroll).not.toHaveBeenCalled();
    viewport.height = pageHeight = 360;
    Object.defineProperty(page, "scrollHeight", { configurable: true, value: 500 });
    viewport.dispatchEvent(new Event("resize")); flush();
    expect(scroll).not.toHaveBeenCalled(); // Enlarged content must remain scrollable.
    Object.defineProperty(page, "scrollHeight", { configurable: true, value: 360 });
    input.blur();
    viewport.height = pageHeight = 360;
    viewport.dispatchEvent(new Event("resize"));
    flush();
    expect(scroll).not.toHaveBeenCalled();
    input.focus();
    cleanup();
    flush();
    expect(page.style.getPropertyValue("--chef-chat-page-height")).toBe("");
    viewport.dispatchEvent(new Event("scroll"));
    flush();
    expect(scroll).not.toHaveBeenCalled();
  } finally {
    cleanup();
    page.remove();
    raf.mockRestore();
    cancel.mockRestore();
    scroll.mockRestore();
    if (original) Object.defineProperty(window, "visualViewport", original);
    else Reflect.deleteProperty(window, "visualViewport");
  }
});
