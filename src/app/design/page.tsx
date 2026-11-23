import { notFound } from "next/navigation";
import { Prototype } from "./prototype";

export const metadata = { title: "Design prototype", robots: { index: false, follow: false } };

/** Dev-only design playground. Returns 404 in production builds. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Prototype />;
}
