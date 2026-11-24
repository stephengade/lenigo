import { Button, Section, Text } from "react-email";
import { brand, EmailLayout, styles } from "./layout";

type Request = {
  name: string;
  email: string;
  communityName: string;
  size: string;
  location: string | null;
  about: string;
  link: string | null;
};

/** To the Global House team when someone fills in "Bring your community". Reply goes to the sender. */
export default function CommunityRequestEmail({ request: r, url }: { request: Request; url: string }) {
  const rows: [string, string | null][] = [
    ["From", `${r.name} <${r.email}>`],
    ["Size", r.size],
    ["Where", r.location],
    ["Link", r.link],
  ];
  return (
    <EmailLayout preview={`${r.name} wants to bring ${r.communityName} to Lenigo.`}>
      <Text style={{ ...styles.small, margin: "0 0 10px", fontWeight: 600, color: brand.primary }}>Community request</Text>
      <Text style={styles.h1}>{r.communityName}</Text>
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ width: "100%", margin: "0 0 16px" }}>
        <tbody>
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <tr key={k}>
                <td style={{ ...styles.small, width: 64, padding: "4px 0", verticalAlign: "top" }}>{k}</td>
                <td style={{ ...styles.small, color: brand.ink, padding: "4px 0", wordBreak: "break-all" }}>{v}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <Section style={{ backgroundColor: brand.page, borderRadius: 12, padding: "14px 16px", margin: "0 0 16px" }}>
        <Text style={{ ...styles.p, margin: 0, color: brand.ink, whiteSpace: "pre-line" }}>{r.about}</Text>
      </Section>
      <Text style={styles.small}>Reply to this email to answer {r.name} directly.</Text>
      <Section style={{ padding: "16px 0 0", textAlign: "center" }}>
        <Button href={url} style={styles.button}>
          Open requests &rarr;
        </Button>
      </Section>
    </EmailLayout>
  );
}

CommunityRequestEmail.PreviewProps = {
  request: {
    name: "Ada",
    email: "ada@example.com",
    communityName: "GDG Ibadan",
    size: "200–1,000",
    location: "Ibadan, Nigeria",
    about: "We run weekly study jams for web and cloud and want mentors to review projects.",
    link: "https://gdg.community.dev/gdg-ibadan/",
  },
  url: "http://localhost:3000/admin/requests",
};
