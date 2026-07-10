import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type CenterPendingEmailProps = {
  centerName: string;
  location: string | null;
  reviewUrl: string;
};

// Internal moderator notification (es-VE): a new center just registered and is
// waiting in the review queue. Not donor/center-facing — recipients are staff.
export function CenterPendingEmail({
  centerName,
  location,
  reviewUrl,
}: CenterPendingEmailProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>Nuevo centro en revisión: {centerName}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Nuevo centro en revisión</Heading>
          <Text style={text}>
            <strong>{centerName}</strong>
            {location ? ` · ${location}` : ""} se registró y está esperando
            aprobación.
          </Text>
          <Section style={buttonWrap}>
            <Button href={reviewUrl} style={button}>
              Revisar centro
            </Button>
          </Section>
          <Text style={muted}>
            Si el botón no funciona, copia y pega este enlace en tu navegador:
            <br />
            {reviewUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CenterPendingEmail;

// Inline styles (email clients require inline; the single blue accent #1F5AA8
// is reserved for the action button, per the design system).
const body: React.CSSProperties = {
  backgroundColor: "#f5f6f8",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  margin: 0,
  padding: "24px 0",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e6e8eb",
  borderRadius: 12,
  margin: "0 auto",
  maxWidth: 480,
  padding: "32px 28px",
};

const heading: React.CSSProperties = {
  color: "#16191d",
  fontSize: 22,
  fontWeight: 700,
  margin: "0 0 16px",
};

const text: React.CSSProperties = {
  color: "#16191d",
  fontSize: 16,
  lineHeight: "24px",
  margin: "0 0 16px",
};

const buttonWrap: React.CSSProperties = {
  margin: "8px 0 24px",
};

const button: React.CSSProperties = {
  backgroundColor: "#1F5AA8",
  borderRadius: 8,
  color: "#ffffff",
  display: "inline-block",
  fontSize: 16,
  fontWeight: 600,
  padding: "12px 24px",
  textDecoration: "none",
};

const muted: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  lineHeight: "18px",
  margin: "0 0 12px",
  wordBreak: "break-all",
};
