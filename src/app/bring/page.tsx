import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { BringForm } from "./bring-form";

export const metadata: Metadata = {
  title: "Bring your community",
  description: "Run your community's learning on Lenigo: roadmaps, mentor-reviewed projects, standups and a leaderboard.",
};

const STEPS = [
  ["Tell us about it", "Who you are, how big, what you want to learn."],
  ["We set you up", "We create your community and spaces, and make you its Lead."],
  ["Invite your people", "Add mentors and members by email or a shareable link."],
] as const;

export default function BringPage() {
  return (
    <main className="relative min-h-dvh px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center">
        <Logo />
      </div>
      <div className="mx-auto mt-10 grid max-w-5xl gap-10 lg:mt-16 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
        <div>
          <h1 className="font-display text-[clamp(2.5rem,6vw,4rem)] leading-[0.92] font-black tracking-tight uppercase">
            Bring your
            <br />
            <span className="mt-2 inline-block -rotate-2 rounded-3xl bg-primary px-4 pt-1 pb-2 text-primary-foreground shadow-pop">community</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Lenigo is set up per community by our team, so every space starts with the right people in charge. Tell us about yours and
            we&rsquo;ll get back to you.
          </p>
          <ol className="mt-8 space-y-4">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sun-soft font-display text-sm font-black">{i + 1}</span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="text-sm text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <BringForm />
      </div>
    </main>
  );
}
