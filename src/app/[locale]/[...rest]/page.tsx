import { notFound } from "next/navigation";

// Unknown URLs render the localized not-found page.
export default function CatchAll() {
  notFound();
}
