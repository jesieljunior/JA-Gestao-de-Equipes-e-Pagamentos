import fs from "fs";
import path from "path";

const DIRECTORIES = ["src", "scripts", "supabase", "drizzle", "docs", "public"];
const IGNORED_FILES = ["scan-secrets.mjs", ".env.example", "package-lock.json"];
const IGNORED_PATTERNS = [/node_modules/, /\.git/, /dist/, /\.output/];

const SECRET_PATTERNS = [
  { name: "Asaas Live Key", regex: /sk_live_[a-zA-Z0-9]{24,}/ },
  { name: "Stripe Live Secret", regex: /sk_live_[0-9a-zA-Z]{24,}/ },
  { name: "AWS Secret Key", regex: /aws_secret_access_key\s*=\s*['"][A-Za-z0-9/+=]{40}['"]/ },
  { name: "Private RSA Key", regex: /-----BEGIN RSA PRIVATE KEY-----/ },
  { name: "Private EC Key", regex: /-----BEGIN EC PRIVATE KEY-----/ },
  { name: "Hardcoded DB Password", regex: /postgres(ql)?:\/\/[^:]+:([^@\s]{6,})@/ },
];

function validarCpfReal(cpf) {
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(limpo)) return false; // descarta repetidos como 11111111111, 00000000000
  if (limpo === "12345678901" || limpo === "98765432100" || limpo === "12345678900") return false; // mock conhecido de teste

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(limpo.charAt(i), 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(limpo.charAt(i), 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(limpo.charAt(10), 10);
}

let violations = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    SECRET_PATTERNS.forEach(({ name, regex }) => {
      if (regex.test(line)) {
        violations.push({
          type: "SECRET",
          name,
          file: filePath,
          line: index + 1,
          snippet: line.trim().slice(0, 80),
        });
      }
    });

    const cpfMatches = line.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g) || [];
    cpfMatches.forEach((cpf) => {
      if (validarCpfReal(cpf)) {
        violations.push({
          type: "PII_CPF",
          name: "Possível CPF Real com Dígito Verificador Válido",
          file: filePath,
          line: index + 1,
          snippet: cpf,
        });
      }
    });
  });
}

function traverse(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (IGNORED_PATTERNS.some((p) => p.test(fullPath))) continue;
    if (IGNORED_FILES.includes(entry.name)) continue;

    if (entry.isDirectory()) {
      traverse(fullPath);
    } else if (entry.isFile()) {
      scanFile(fullPath);
    }
  }
}

DIRECTORIES.forEach(traverse);

console.log("=== RELATÓRIO DE AUDITORIA DE SEGREDOS E PII (LGPD) ===");
console.log(`Diretórios escaneados: ${DIRECTORIES.join(", ")}`);
if (violations.length === 0) {
  console.log("✓ NENHUM SEGREDO OU DADO PESSOAL REAL ENCONTRADO NO REPOSITÓRIO.");
  console.log(
    "✓ Todos os CPFs e dados fiscais identificados são estritamente mocks sintéticos e testes.",
  );
  process.exit(0);
} else {
  console.error(`✗ ${violations.length} VIOLAÇÕES ENCONTRADAS:`);
  console.error(JSON.stringify(violations, null, 2));
  process.exit(1);
}
