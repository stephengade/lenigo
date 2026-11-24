import { Button, Hr, Link, Section, Text } from "react-email";
import { ROLE_LABEL } from "@/lib/permissions";
import { ROLE_BLURB } from "@/lib/role-copy";
import { brand, EmailLayout, styles } from "./layout";

export type InviteEmailProps = {
  /** Community name, or "Community · Space" for a space invite. */
  place: string;
  role: keyof typeof ROLE_LABEL;
  inviter: string;
  /** The link in the button. Signs the invitee in and accepts when one-click is on. */
  url: string;
  expires: string;
  oneClick: boolean;
};

/** Invite email: one button. No sign-in code to copy; the invite page handles the rest. */
export default function InviteEmail({ place, role, inviter, url, expires, oneClick }: InviteEmailProps) {
  const label = ROLE_LABEL[role];
  return (
    <EmailLayout preview={`${inviter} invited you to join ${place} as ${label}.`}>
      <Text style={{ ...styles.small, margin: "0 0 10px", fontWeight: 600, color: brand.primary }}>You&rsquo;re invited</Text>
      <Text style={styles.h1}>{place}</Text>
      <Text style={styles.p}>
        <strong style={{ color: brand.ink, fontWeight: 600 }}>{inviter}</strong> invited you to join as{" "}
        <strong style={{ color: brand.ink, fontWeight: 600 }}>{label}</strong>. {ROLE_BLURB[role]}
      </Text>

      <Section style={{ padding: "8px 0 24px", textAlign: "center" }}>
        <Button href={url} style={styles.button}>
          Accept invite &rarr;
        </Button>
        <Text style={{ ...styles.small, marginTop: 12, textAlign: "center" }}>
          {oneClick
            ? "One press signs you in and adds you. No password or code needed."
            : "Opens Lenigo, where we'll email you a sign-in code to confirm it's you."}
        </Text>
      </Section>

      <Section style={{ backgroundColor: brand.sun, borderRadius: 12, padding: "14px 16px" }}>
        <Text style={{ ...styles.small, color: brand.ink }}>
          This invite is for you only and works once. It expires on {expires}.
        </Text>
      </Section>

      <Hr style={{ borderColor: brand.line, margin: "24px 0 16px" }} />
      <Text style={styles.small}>
        Button not working? Paste this into your browser:
        <br />
        <Link href={url} style={{ color: brand.primary, wordBreak: "break-all" }}>
          {url}
        </Link>
      </Text>
      <Text style={{ ...styles.small, marginTop: 12 }}>
        Not expecting this? You can ignore it; nothing happens unless you accept.{" "}
        {oneClick ? "Don't forward this email: the button signs in as you." : null}
      </Text>
    </EmailLayout>
  );
}

InviteEmail.PreviewProps = {
  place: "Agentic Club",
  role: "OWNER",
  inviter: "Stephen",
  url: "http://localhost:3000/invite/example",
  expires: "8 Dec 2026",
  oneClick: true,
} satisfies InviteEmailProps;
