// Validação do cálculo salarial e invariante do custoVBG.
//
// (1) Compara com a referência Doutor Finanças (base 1500€, casado 2 titulares,
//     duodécimos 100%, subsídio alimentação cartão 10,46€/dia).
// (2) Garante que custoVBG === brutoAnual === soma das fatias do donut
//     (base líquida + SS total + IRS + alimentação + ajudas + passe + benefícios).
// (3) Garante ausência de duplicação de benefícios/ajudas/passe.

import { computeSnapshot } from "../src/lib/salary.ts";

const base = (overrides = {}) => ({
  id: "t", collaborator_id: "c", label: "t", reference_date: "2026-01-01",
  is_effective: true, valor_base: 1500, ss_atelier_pct: 0.2375, ss_colaborador_pct: 0.11,
  irs_pct: 0.1121, meses_pagos: 14, subsidio_alimentacao_diario: 10.46, dias_uteis: 230,
  ajudas_custo_anual: 0, passe_anual: 0, beneficio_carro: 0, beneficio_ticket: 0,
  premio_associado: 0, outros_beneficios: 0, beneficio_variavel: 0, plano_reforma: 0,
  notas: null, localizacao: "continente", estado_civil: "casado", numero_titulares: 2,
  numero_dependentes: 0, dependentes_com_deficiencia: 0, ano_fiscal: 2026,
  irs_calculado_auto: false, subsidios_modo: "duodecimos_100",
  subsidio_alimentacao_manual: false, subsidio_alimentacao_diario_manual: 0,
  effective_from: "2026-01-01", effective_to: null, source: "manual", import_log_id: null,
  ...overrides,
});

let failures = 0;
const eq = (label, got, want, tol = 0.5) => {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${got.toFixed(2)} want ~${want.toFixed(2)}`);
  if (!ok) failures++;
};

// ---------- Teste 1: referência Doutor Finanças ----------
console.log("\n[1] Referência Doutor Finanças (base 1500, duodécimos 100%, alim 10,46×230)");
const ref = computeSnapshot(base());
// Mensal: base 1500 + duodécimos 250 = 1750 tributável; alim 10,46×230/12 = 200,48
eq("baseMensalTributavel", ref.baseMensalTributavel, 1750);
eq("baseAnual (base×14)", ref.baseAnual, 21000);
eq("ssAtelierAnual (23,75%)", ref.ssAtelierAnual, 4987.5);
eq("ssColaboradorAnual (11%)", ref.ssColaboradorAnual, 2310);
eq("alimentacaoAnual (10,46×230)", ref.alimentacaoAnual, 2405.8);
// Custo patronal anual = base×14 + SS patronal + alim
//   = 21000 + 4987,5 + 2405,8 = 28393,3
// DF: 28518,82 (usa 11 meses de alim a 22 dias = 2531,32). Diferença ~125€ esperada.
eq("brutoAnual (vs DF 28518,82)", ref.brutoAnual, 28393.3, 200);

// ---------- Teste 2: invariante custoVBG === brutoAnual ----------
console.log("\n[2] Invariante: custoVBG === brutoAnual (sem duplicação)");
const withExtras = computeSnapshot(base({
  ajudas_custo_anual: 2400, passe_anual: 360,
  beneficio_carro: 1000, outros_beneficios: 500,
}));
console.log(`  brutoAnual   = ${withExtras.brutoAnual.toFixed(2)}`);
console.log(`  custoVBG     = ${withExtras.custoVBG.toFixed(2)}`);
eq("custoVBG === brutoAnual", withExtras.custoVBG, withExtras.brutoAnual, 0.01);

// ---------- Teste 3: soma das fatias do donut === custoVBG ----------
console.log("\n[3] Soma das fatias do donut === custoVBG");
// Donut em BrutoTab: baseLíquida + SS total (patronal+colab) + IRS + alim + ajudas + passe + benefícios
const c = withExtras;
const baseLiquidaAnual = c.baseAnual - c.ssColaboradorAnual - c.irsAnual;
const ssTotalAnual = c.ssAtelierAnual + c.ssColaboradorAnual;
const somaFatias = baseLiquidaAnual + ssTotalAnual + c.irsAnual
  + c.alimentacaoAnual + (withExtras.ajudasMensal * 12) + c.passeAnual + c.beneficiosAnual;
console.log(`  soma fatias  = ${somaFatias.toFixed(2)}`);
console.log(`  custoVBG     = ${c.custoVBG.toFixed(2)}`);
eq("soma fatias === custoVBG", somaFatias, c.custoVBG, 0.01);

// ---------- Teste 4: João Almeida (caso reportado) ----------
console.log("\n[4] Caso reportado: donut center deve igualar soma das fatias (~28940,80)");
// Aproximação dos valores do João Almeida observados no donut
const joao = computeSnapshot(base({
  valor_base: 1224, // ≈ líquido*12 retro-derivado; ajustar irs_pct para bater nos valores
  irs_pct: 0.0961, subsidios_modo: "tradicional",
  ajudas_custo_anual: 2400, passe_anual: 360, outros_beneficios: 1500,
  subsidio_alimentacao_diario: 10.46,
}));
// Não validamos o valor exacto (depende dos inputs reais); validamos apenas a invariante
eq("João: custoVBG === brutoAnual", joao.custoVBG, joao.brutoAnual, 0.01);

console.log(`\n${failures === 0 ? "✅ Todos os testes passaram" : `❌ ${failures} falha(s)`}`);
process.exit(failures === 0 ? 0 : 1);
