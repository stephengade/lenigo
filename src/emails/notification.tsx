import { Button, Hr, Section, Text } from "react-email";
import { brand, EmailLayout, styles } from "./layout";

export type NotificationEmailProps = {
  /** Small label above the title, e.g. "Project reviewed". */
  eyebrow: string;
  title: string;
  /** Short paragraphs. Plain text. */
  lines: string[];
  /** Someone's own words (mentor feedback, promotion reason), shown as a quote. */
  quote?: { text: string; by: string } | null;
  button: { label: string; url: string };
  /** Where this came from, e.g. "GDG OAU · Web Development". */
  place: string;
  /** Link to turn these emails off (the person's profile). */
  settingsUrl: string;
};

/** One layout for every learning notification: what happened, any feedback, one button. */
export default function NotificationEmail({ eyebrow, title, lines, quote, button, place, settingsUrl }: NotificationEmailProps) {
  return (
    <EmailLayout preview={lines[0] ?? title}>
      <Text style={{ ...styles.small, margin: "0 0 10px", fontWeight: 600, color: brand.primary }}>{eyebrow}</Text>
      <Text style={styles.h1}>{title}</Text>
      {lines.map((line, i) => (
        <Text key={i} style={styles.p}>
          {line}
        </Text>
      ))}

      {quote ? (
        <Section style={{ backgroundColor: brand.page, borderRadius: 12, padding: "14px 16px", margin: "0 0 16px" }}>
          <Text style={{ ...styles.p, margin: 0, color: brand.ink, whiteSpace: "pre-line" }}>{quote.text}</Text>
          <Text style={{ ...styles.small, marginTop: 8 }}>{quote.by}</Text>
        </Section>
      ) : null}

      <Section style={{ padding: "8px 0 8px", textAlign: "center" }}>
        <Button href={button.url} style={styles.button}>
          {button.label} &rarr;
        </Button>
      </Section>

      <Hr style={{ borderColor: brand.line, margin: "24px 0 16px" }} />
      <Text style={styles.small}>
        From {place}. You get these because you learn on Lenigo.{" "}
        <a href={settingsUrl} style={{ color: brand.primary }}>
          Turn off learning emails
        </a>{" "}
        from your profile.
      </Text>
    </EmailLayout>
  );
}

NotificationEmail.PreviewProps = {
  eyebrow: "Project reviewed",
  title: "Approved: Build a profile page",
  lines: ["Ada approved your project in Frontend. Your roadmap has moved on to the next module."],
  quote: { text: "Clean, semantic HTML. Next time, add alt text to every image.", by: "Ada, Mentor" },
  button: { label: "Open your roadmap", url: "http://localhost:3000/c/gdg-oau/web-dev/roadmap" },
  place: "GDG OAU · Web Development",
  settingsUrl: "http://localhost:3000/u/you",
} satisfies NotificationEmailProps;
