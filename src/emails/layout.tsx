import { Fragment } from "react";
import { Body, Container, Head, Html, Preview, Section, Text } from "react-email";

/**
 * Brand shell for every Lenigo email: logo, white card, footer. Colours and type match the app
 * (src/app/globals.css). Inline styles only: email clients drop most CSS.
 */
export const brand = {
  ink: "#16181e",
  muted: "#646971",
  faint: "#8a8f97",
  page: "#f0f3f5",
  line: "#e1e4e7",
  primary: "#437ded",
  sun: "#fff4ca",
  ember: "#ec7c0e",
  display: "'Rubik', Arial, Helvetica, sans-serif",
  body: "'Inter', Arial, Helvetica, sans-serif",
} as const;

/** The Lenigo mark (rising steps + ember spark), drawn with table cells so Outlook shows it too. */
function Mark() {
  const cell = (w: number, h: number, bg?: string, radius?: number) => (
    <td
      width={w}
      height={h}
      style={{ width: w, height: h, fontSize: 0, lineHeight: 0, backgroundColor: bg, borderRadius: radius }}
    >
      &nbsp;
    </td>
  );
  const row = (...cells: React.ReactNode[]) => (
    <tr>
      <td style={{ padding: 0, fontSize: 0, lineHeight: 0 }}>
        <table role="presentation" width={32} cellPadding={0} cellSpacing={0} border={0} style={{ width: 32 }}>
          <tbody>
            <tr>{cells.map((c, i) => <Fragment key={i}>{c}</Fragment>)}</tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
  return (
    <table
      role="presentation"
      width={32}
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ width: 32, height: 32, backgroundColor: brand.ink, borderRadius: 9 }}
    >
      <tbody>
        {row(cell(32, 7))}
        {row(cell(20, 6), cell(6, 6, brand.ember, 3), cell(6, 6))}
        {row(cell(32, 2))}
        {row(cell(18, 4), cell(5, 4, "#ffffff"), cell(9, 4))}
        {row(cell(13, 4), cell(5, 4, "#ffffff"), cell(5, 4, "#ffffff"), cell(9, 4))}
        {row(cell(32, 9))}
      </tbody>
    </table>
  );
}

export function EmailLayout({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: "40px 16px", backgroundColor: brand.page, fontFamily: brand.body }}>
        <Container style={{ width: "100%", maxWidth: 480 }}>
          <Section style={{ padding: "0 8px 20px" }}>
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
              <tbody>
                <tr>
                  <td valign="middle">
                    <Mark />
                  </td>
                  <td
                    valign="middle"
                    style={{
                      paddingLeft: 8,
                      fontFamily: brand.display,
                      fontSize: 18,
                      fontWeight: 900,
                      letterSpacing: -0.3,
                      color: brand.ink,
                      textTransform: "uppercase",
                    }}
                  >
                    Lenigo
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: 20, border: `1px solid ${brand.line}`, padding: "36px 40px" }}>
            {children}
          </Section>
          <Text style={{ margin: "24px 0 0", textAlign: "center", fontSize: 12, lineHeight: "18px", color: brand.faint }}>
            Lenigo · Learn it. Build it. Ship it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const styles = {
  h1: {
    margin: "0 0 8px",
    fontFamily: brand.display,
    fontSize: 26,
    lineHeight: "30px",
    fontWeight: 900,
    letterSpacing: -0.3,
    color: brand.ink,
    textTransform: "uppercase",
  },
  p: { margin: "0 0 16px", fontSize: 15, lineHeight: "23px", color: brand.muted },
  small: { margin: 0, fontSize: 13, lineHeight: "20px", color: brand.muted },
  button: {
    display: "inline-block",
    padding: "13px 28px",
    borderRadius: 999,
    backgroundColor: brand.primary,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 600,
    textDecoration: "none",
  },
} satisfies Record<string, React.CSSProperties>;
