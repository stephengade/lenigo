"use client";

import { useEffect, useState } from "react";
import { Loader2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, invalid } from "@/components/form-field";
import { useZodForm } from "@/components/use-zod-form";
import { projectSchema } from "@/lib/schemas";
import { QuestionList } from "@/components/learn/checkpoint-quiz";
import { spaceApi, useApiAction } from "@/components/use-api-action";

export function PlacementQuiz({
  c,
  s,
  attemptId,
  deadline,
  questions,
}: {
  c: string;
  s: string;
  attemptId: string;
  deadline: string;
  questions: { id: string; prompt: string; codeSnippet: string | null; options: string[] }[];
}) {
  const { pending, run } = useApiAction();
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const [left, setLeft] = useState(() => Math.max(0, new Date(deadline).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, new Date(deadline).getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  const answered = answers.filter((a) => a !== null).length;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        // Unanswered questions are sent as option 0 only after the learner confirms.
        if (answered < questions.length && !confirm(`${questions.length - answered} questions are unanswered. Submit anyway?`)) return;
        run(() => spaceApi(c, s).placement({ id: attemptId }).quiz.post({ answers: answers.map((a) => a ?? 0) }), {
          success: (d) => (d.passed ? `${d.scorePct}%: on to the practical task` : `${d.scorePct}%: not this time (pass mark ${d.passPct}%)`),
        });
      }}
    >
      <div className="sticky top-20 z-10 flex items-center justify-between rounded-full bg-ink px-5 py-2.5 text-sm text-ink-foreground shadow-pop">
        <span>
          {answered}/{questions.length} answered
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold tabular">
          <Timer className="size-4" /> {left > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : "Time's up"}
        </span>
      </div>
      <QuestionList name="placement" questions={questions} answers={answers} onAnswer={(q, o) => setAnswers(answers.map((x, i) => (i === q ? o : x)))} disabled={left <= 0} />
      <div>
        <Button type="submit" size="lg" disabled={pending || left <= 0}>
          {pending ? <Loader2 className="animate-spin" /> : null} Submit quiz
        </Button>
      </div>
    </form>
  );
}

export function PlacementTaskForm({ c, s, attemptId }: { c: string; s: string; attemptId: string }) {
  const { pending, run } = useApiAction();
  const form = useZodForm(projectSchema, { repoUrl: "", liveUrl: "", notes: "" });
  const err = (k: "repoUrl" | "liveUrl") => form.formState.errors[k]?.message;
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={form.handleSubmit((v) => run(() => spaceApi(c, s).placement({ id: attemptId }).task.post({ repoUrl: v.repoUrl, liveUrl: v.liveUrl }), { success: "Sent for review" }))}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code (repository link)" htmlFor="pt-repo" error={err("repoUrl")}>
          <Input id="pt-repo" type="url" placeholder="https://github.com/you/placement" {...form.register("repoUrl")} {...invalid("pt-repo", err("repoUrl"))} />
        </Field>
        <Field label="Live link (optional)" htmlFor="pt-live" error={err("liveUrl")}>
          <Input id="pt-live" type="url" placeholder="https://your-project.vercel.app" {...form.register("liveUrl")} {...invalid("pt-live", err("liveUrl"))} />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Submit task
        </Button>
      </div>
    </form>
  );
}
