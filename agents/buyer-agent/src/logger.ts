const AGENT_NAME = "buyer-agent";

const SECRET_NAMES = /private_key|secret|password|token|api_key/i;

function redact(message: string): string {
  let text = message.replace(/0x[0-9a-fA-F]{64}/g, "[redacted]");
  text = text.replace(
    /(private_key|secret|password|token|api_key)\s*[=:]\s*\S+/gi,
    "$1=[redacted]",
  );
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 8 || !SECRET_NAMES.test(name)) continue;
    text = text.split(value).join("[redacted]");
  }
  return text;
}

export function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${AGENT_NAME} ${redact(message)}`);
}
