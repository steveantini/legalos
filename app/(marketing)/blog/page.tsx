import { redirect } from "next/navigation";

/**
 * The Blog shell is retired (D-159): an honest page with no posts serves
 * nobody, so it left the footer and the site until there is something to
 * say. Old links land on About, the page the shell itself pointed readers
 * to. The redirect is deliberately TEMPORARY (307), unlike the renamed
 * pages' 308s (/security, /integrations): the blog may return, and a
 * permanent redirect would be cached against it.
 */
export default function BlogPage() {
  redirect("/about");
}
