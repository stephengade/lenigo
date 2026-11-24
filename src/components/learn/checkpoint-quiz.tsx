"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { spaceApi, useApiAction } from "@/components/use-api-action";
import { cn } from "@/lib/utils";

type Question = { id: string; prompt: string; codeSnippet: string | null; options: string[]; correctOptionIndex?: number };

export function QuestionList({
  questions,
  answers,
  onAnswer,
  wrong,
  explanations,
  disabled,
  name,
}: {
  questions: Question[];
  answers: (number | null)[];
  onAnswer: (q: number, option: number) => void;
  wrong?: number[];
  explanations?: (string | null)[];
  disabled?: boolean;
  name: string;
}) {
  return (
    <ol className="grid gap-4">
      {questions.map((q, i) => (
        <li key={q.id} className={cn("rounded-xl border p-4", wrong?.includes(i) ? "border-rose bg-rose-soft/40" : "border-border")}>
          <p className="text-sm font-medium">
            <span className="text-muted-foreground">{i + 1}. </span>
            {q.prompt}
          </p>
          {q.codeSnippet ? <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 font-mono text-xs text-ink-foreground">{q.codeSnippet}</pre> : null}
          <div className="mt-3 grid gap-1.5" role="radiogroup" aria-label={`Question ${i + 1}`}>
            {q.options.map((o, j) => (
              <label
                key={j}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface",
                  answers[i] === j && "bg-secondary",
                  q.correctOptionIndex === j && "font-medium text-mint-foreground",
                  disabled && "cursor-default",
                )}
              >
                <input type="radio" name={`${name}-${i}`} className="size-4 accent-[var(--color-primary)]" checked={answers[i] === j} disabled={disabled} onChange={() => onAnswer(i, j)} />
                {o}
                {q.correctOptionIndex === j ? <span className="ml-auto text-xs">answer key</span> : null}
              </label>
            ))}
          </div>
          {wrong?.includes(i) ? <p className="mt-2 text-xs font-medium text-rose-foreground">Not quite. Rewatch the lesson and try again.</p> : null}
          {explanations?.[i] ? <p className="mt-2 rounded-lg bg-mint-soft px-3 py-2 text-xs text-mint-foreground">{explanations[i]}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function CheckpointQuiz({
  c,
  s,
  checkpoint,
  preview,
}: {
  c: string;
  s: string;
  checkpoint: { id: string; title: string; passThreshold: number; open: boolean; passed: boolean; best: number; attempts: number; cooldownUntil: Date | null; questions: Question[] };
  preview: boolean;
}) {
  const { pending, run } = useApiAction();
  const [answers, setAnswers] = useState<(number | null)[]>(checkpoint.questions.map(() => null));
  const [result, setResult] = useState<{ scorePct: number; passed: boolean; wrong: number[]; explanations: (string | null)[] } | null>(null);
  const cooling = checkpoint.cooldownUntil && new Date(checkpoint.cooldownUntil) > new Date();

  if (checkpoint.passed && !result) {
    return (
      <p className="inline-flex items-center gap-2 text-sm font-medium text-mint-foreground">
        <CheckCircle2 className="size-4 text-mint" /> Passed with {checkpoint.best}%
      </p>
    );
  }
  if (!checkpoint.open && !preview) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="size-4" /> Opens when you finish the lesson above.
      </p>
    );
  }
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => spaceApi(c, s).checkpoints({ id: checkpoint.id }).attempts.post({ answers: answers.map((a) => a ?? -1).map((a) => Math.max(0, a)) }), {
          onDone: (d) => setResult(d),
          success: (d) => (d.passed ? `Passed with ${d.scorePct}%` : `${d.scorePct}%: you need ${d.passThreshold}%`),
          refresh: true,
        });
      }}
    >
      <p className="text-xs text-muted-foreground">
        Pass mark {checkpoint.passThreshold}%{checkpoint.attempts ? ` · ${checkpoint.attempts} attempt${checkpoint.attempts === 1 ? "" : "s"} so far` : ""}. Two misses in a row means a 10-minute
        break to rewatch.
      </p>
      <QuestionList
        name={checkpoint.id}
        questions={checkpoint.questions}
        answers={answers}
        onAnswer={(q, o) => setAnswers(answers.map((x, i) => (i === q ? o : x)))}
        wrong={result?.wrong}
        explanations={result?.explanations}
        disabled={preview || result?.passed}
      />
      {preview ? (
        <p className="text-xs text-muted-foreground">Preview: answers aren&rsquo;t submitted.</p>
      ) : result?.passed ? null : cooling ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4" /> Try again after {new Date(checkpoint.cooldownUntil!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
        </p>
      ) : (
        <div>
          <Button type="submit" disabled={pending || answers.some((a) => a === null)}>
            {pending ? <Loader2 className="animate-spin" /> : null} Check my answers
          </Button>
        </div>
      )}
    </form>
  );
}
