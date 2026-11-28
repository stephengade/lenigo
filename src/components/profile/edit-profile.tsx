"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, invalid } from "@/components/form-field";
import { useZodForm } from "@/components/use-zod-form";
import { profileSchema } from "@/lib/schemas";
import { useApiAction } from "@/components/use-api-action";
import { api } from "@/lib/api";

export function EditProfileDialog({
  profile,
}: {
  profile: { name: string | null; username: string; bio: string | null; emailNotifications: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, run } = useApiAction();
  const form = useZodForm(profileSchema, { name: profile.name ?? "", username: profile.username, bio: profile.bio ?? "", emailNotifications: profile.emailNotifications });
  const err = (k: "name" | "username" | "bio") => form.formState.errors[k]?.message;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil /> Edit profile
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((v) =>
            run(() => api.me.patch(v), {
              success: "Profile saved",
              refresh: false,
              onDone: (d) => {
                setOpen(false);
                router.replace(`/u/${d.username}`);
                router.refresh();
              },
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>Your public profile</DialogTitle>
            <DialogDescription>Anyone with the link can see this page: your name, bio, levels and approved projects. Never your email or points.</DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor="pf-name" error={err("name")}>
            <Input id="pf-name" maxLength={60} {...form.register("name")} {...invalid("pf-name", err("name"))} />
          </Field>
          <Field label="Username" htmlFor="pf-user" hint="lenigo/u/your-name. Lowercase letters, numbers and hyphens." error={err("username")}>
            <Input id="pf-user" maxLength={30} autoCapitalize="none" {...form.register("username")} {...invalid("pf-user", err("username"))} />
          </Field>
          <Field label="Bio" htmlFor="pf-bio" error={err("bio")}>
            <Textarea id="pf-bio" rows={3} maxLength={280} placeholder="What you're learning and building." {...form.register("bio")} {...invalid("pf-bio", err("bio"))} />
          </Field>
          <label htmlFor="pf-emails" className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface p-3.5">
            <input
              id="pf-emails"
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              {...form.register("emailNotifications")}
            />
            <span className="text-sm">
              <span className="font-medium">Learning emails</span>
              <span className="block text-muted-foreground">
                Project reviews, level-ups and session reminders. Only you see this setting; invites and sign-in codes always arrive.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
