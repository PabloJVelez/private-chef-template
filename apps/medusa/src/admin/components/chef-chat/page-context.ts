import type { UIMatch } from "react-router-dom";
import type {
  PageHint,
  SousChefRouteDescriptor,
} from "../../../lib/chef-ai/page-context";
const generic: PageHint = { version: 1, surface: "generic", view: "unknown" };
/** Matches already respect the router basename. Only a generated empty-path leaf
 * may inherit its parent's descriptor; unrelated descendants terminate context. */
export function pageHintFromMatches(
  matches: Pick<UIMatch, "handle" | "params" | "pathname">[],
): PageHint {
  let page: PageHint = generic;
  let resourcePath: string | undefined;
  let inheritedLeaf = false;
  for (const match of matches) {
    const handle = match.handle as
      | { sousChef?: SousChefRouteDescriptor }
      | undefined;
    if (handle && Object.prototype.hasOwnProperty.call(handle, "sousChef")) {
      inheritedLeaf = false;
      const descriptor = handle.sousChef;
      const id =
        descriptor?.resource && match.params[descriptor.resource.idParam];
      if (
        !descriptor ||
        !id ||
        !/^[a-zA-Z0-9_-]{1,200}$/.test(id) ||
        !(
          (descriptor.surface === "chef-events" &&
            descriptor.resource.kind === "private-event") ||
          (descriptor.surface === "menus" &&
            descriptor.resource.kind === "menu")
        )
      ) {
        page = generic;
        resourcePath = undefined;
      } else {
        page = {
          version: 1,
          surface: descriptor.surface,
          view: descriptor.view,
          resource: { kind: descriptor.resource.kind, id },
        } as PageHint;
        resourcePath = match.pathname.replace(/\/$/, "");
      }
    } else if (
      resourcePath &&
      !handle &&
      !inheritedLeaf &&
      resourcePath === match.pathname.replace(/\/$/, "")
    ) {
      inheritedLeaf = true; // Medusa's one generated, unannotated empty-path leaf.
    } else {
      page = generic;
      resourcePath = undefined;
    }
  }
  return page;
}
