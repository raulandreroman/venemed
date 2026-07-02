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

type CenterApprovedEmailProps = {
  centerName: string | null;
  loginUrl: string;
};

// es-VE approval notification. Copy is colocated here (no central i18n module).
// Uses "lista" (not "solicitud") — the request → lista rename already landed.
export function CenterApprovedEmail({
  centerName,
  loginUrl,
}: CenterApprovedEmailProps) {
  const saludo = centerName ? `¡Hola, ${centerName}!` : "¡Hola!";

  return (
    <Html lang="es">
      <Head />
      <Preview>Tu centro fue aprobado en VeneMed</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Tu centro fue aprobado ✓</Heading>
          <Text style={text}>{saludo}</Text>
          <Text style={text}>
            Tu centro ya fue <strong>aprobado</strong> en VeneMed. Ahora puedes
            iniciar sesión y publicar tu <strong>lista</strong> de insumos para
            que los donantes te encuentren.
          </Text>
          <Section style={buttonWrap}>
            <Button href={loginUrl} style={button}>
              Iniciar sesión
            </Button>
          </Section>
          <Text style={muted}>
            Si el botón no funciona, copia y pega este enlace en tu navegador:
            <br />
            {loginUrl}
          </Text>
          <Text style={muted}>Gracias por sumarte. — El equipo de VeneMed</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CenterApprovedEmail;

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
