// Sample template for the HR salary importer.
// PT headers (matched by alias map) + a couple of example rows.
// Delivered as CSV (UTF-8 BOM) so Excel opens it cleanly with PT locale.

export const SALARY_TEMPLATE_HEADERS = [
  "Nome",
  "Email",
  "Número colaborador",
  "Salário Base",
  "Subsídio Alimentação",
  "TSU",
  "SS Colaborador",
  "IRS",
  "Meses Pagos",
  "Data Início",
  "Notas",
] as const;

const SAMPLE_ROWS: (string | number)[][] = [
  [
    "Maria Silva",
    "maria.silva@empresa.pt",
    "001",
    1500,
    "6,00",
    "23,75%",
    "11%",
    "12%",
    14,
    "01/01/2026",
    "Exemplo — apagar",
  ],
  [
    "João Costa",
    "joao.costa@empresa.pt",
    "002",
    2200,
    "7,63",
    "23,75%",
    "11%",
    "15%",
    14,
    "01/01/2026",
    "",
  ],
];

const escapeCsv = (v: string | number) => {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildSalaryTemplateCsv(): Blob {
  const sep = ";"; // pt-PT Excel default
  const lines = [SALARY_TEMPLATE_HEADERS.map(escapeCsv).join(sep)];
  for (const row of SAMPLE_ROWS) lines.push(row.map(escapeCsv).join(sep));
  // BOM so Excel detects UTF-8
  const body = "\uFEFF" + lines.join("\r\n") + "\r\n";
  return new Blob([body], { type: "text/csv;charset=utf-8" });
}

export function downloadSalaryTemplate(filename = "salary-import-template.csv") {
  const blob = buildSalaryTemplateCsv();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
