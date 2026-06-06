import { permanentRedirect } from "next/navigation";

/**
 * The standalone Template Library was folded into the adaptive My Workflows
 * screen (templates render there as the "Start from a template" section, and
 * as the leading gallery when the user has no workflows yet). This route
 * survives only so old deep-links land in the right place.
 */
export default function TemplateLibraryRedirect(): never {
  permanentRedirect("/workspace/workflows/my-workflows");
}
