"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/form-field";
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
  const [name, setName] = useState(profile.name ?? "");
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [emails, setEmails] = useState(profile.emailNotifications);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil /> Edit profile
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.me.patch({ name, username, bio: bio || null, emailNotifications: emails }), {
              success: "Profile saved",
              refresh: false,
              onDone: (d) => {
                setOpen(false);
                router.replace(`/u/${d.username}`);
                router.refresh();
              },
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Your public profile</DialogTitle>
            <DialogDescription>Anyone with the link can see this page: your name, bio, levels and approved projects. Never your email or points.</DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor="pf-name">
            <Input id="pf-name" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Username" htmlFor="pf-user" hint="lenigo/u/your-name. Lowercase letters, numbers and hyphens.">
            <Input id="pf-user" required minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9-]{1,28}[a-z0-9]" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} />
          </Field>
          <Field label="Bio" htmlFor="pf-bio">
            <Textarea id="pf-bio" rows={3} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What you're learning and building." />
          </Field>
          <label htmlFor="pf-emails" className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface p-3.5">
            <input
              id="pf-emails"
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={emails}
              onChange={(e) => setEmails(e.target.checked)}
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
