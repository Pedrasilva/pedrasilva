# Templates completos — 11 novembro 2026

## Resultado
Importação movida do compositor de blocos para o menu geral da proposta, disponível nos três passos. Seleção independente de Planeamento/Gantt, Honorários, pagamentos, blocos e página-mestra; valores de honorários têm caixa separada. Aviso identifica secções preenchidas a substituir. Importação e desfazer são transacionais, preservam cópia anterior e rejeitam revisões desatualizadas/propostas bloqueadas ou convertidas. Pode reabrir o diálogo para desfazer; nenhuma permissão individual mudou.

**Hotel Alqueva antigo:** 39 blocos / 36 fases guardados, mas não hierarquia/alocações/calculadora/totais completos. Recuperação das 36 fases passou, mas para obter Gantt hierárquico e paridade financeira precisa de **Guardar como template novamente na proposta de origem**. O template existente não foi alterado. Teste completo usou novo template descartável gravado de 2616 Hotel Alqueva (título; número atual guardado 2660). Origem consultada apenas; Travessa do Oleiro não foi alterada.

## O que cada novo registo guarda
`quote_templates.full_quote_snapshot` versão 2:
- Settings comerciais: valor/calculadora, tipo/estrutura de honorários, multiplicador, margem, modo de venda, configurações de construção/avença/deslocação, IVA e condições de pagamento.
- `quote_stages`: hierarquia, fases ligadas, durações/posições relativas, dependências, identidade de fornecedores, aprovação/marcos, opcionais e avenças.
- Alocações e respetivos snapshots de custos/venda; serviços externos; custos de fornecedores/fases, markups e splits; deslocações e preços faturáveis.
- Regras de pagamentos: percentagens, triggers, âmbito/fornecedor, IVA e prazo; sem datas previstas, grupos de faturas, estados ou descrições fiscais. Valores fixos convertem-se em percentagens do orçamento da fase.
- Blocos ricos, referências, visibilidade e configuração de páginas. Texto parametrizado usa a proposta destinatária; overrides de capa de nome/local/referência não são transportados.
- Identificadores internos de origem servem exclusivamente como chaves de remapeamento; cliente/contactos/identidade fiscal não são copiados para a proposta destinatária.

`quote_template_imports`: cópia privada integral anterior, autor, template, hash após importação e marca de desfazer. A cópia privada conserva os dados da própria destinatária, não é um template exportável; acesso mantém autorização administrativa existente.

## Testes
| Verificação | Resultado |
|---|---|
| Vazia: 36 fases, 29 dependências, 41 alocações, 5 deslocações, 9 preços faturáveis, 91 regras, 39 blocos | PASS |
| Hierarquia/referências remapeadas; zero referências de fases inválidas | PASS |
| Zero datas operacionais em fases importadas | PASS |
| Gantt design/construção renderizados | PASS: 5 / 3 linhas |
| Resumo financeiro visível vs origem | PASS: texto integral idêntico, Arquitetura 488 500 € |
| Rollup comum origem/destinatária | PASS: valor 1 013 200 €, custo 395 244,14 €, resultado 617 955,86 €, 10 408,4 h |
| Desfazer proposta vazia | PASS: zero fases |
| Proposta preenchida: aviso + importação + desfazer pela interface | PASS; ID e orçamento original 9 876 € restaurados |
| Valores desmarcados | PASS: orçamento/avença/custo/venda alocados zerados, estrutura mantida |
| Template antigo | PASS: recupera 36 fases; ausência de fidelidade declarada |
| 3 testes seleção/avisos, paridade EN/PT, auditoria de traduções | PASS; zero novas mensagens literais |
| SQL espelhado | PASS, quatro pares byte-idênticos |
| Limpeza propostas/template/cópias privadas | Independente: zero |

As duas propostas e o novo template de teste foram eliminados. Capturas: [planeamento](full-quote-templates/planning.png), [financeiro](full-quote-templates/financial.png), [aviso](full-quote-templates/overwrite.png), [desfazer](full-quote-templates/undone.png), [Gantt](full-quote-templates/gantt-block.png). Resultados integrais nos JSON/log dessa pasta.

## Ficheiros / SQL
- `src/components/quotes/import-full-template-dialog.tsx` (novo).
- `src/lib/quotes/full-template.ts`, `full-template.test.ts` (novos).
- `src/routes/_app.crm.quotes.$quoteId.tsx` (menu geral).
- `src/components/psa-composer/composer-top-bar.tsx` (remove porta antiga).
- `src/i18n/locales/{en,pt-PT}/crm.json`.
- `drizzle/migrations/0291_full_quote_templates.sql` ↔ `supabase/migrations/20261111224700_full_quote_templates.sql`.
- `0292_template_save_stage_key_fix.sql` ↔ `20261111224900_template_save_stage_key_fix.sql`.
- `0293_template_relative_stage_mode.sql` ↔ `20261111225100_template_relative_stage_mode.sql`.
- `0294_template_section_fidelity.sql` ↔ `20261111225500_template_section_fidelity.sql`.
- Tipos gerados atualizados pela ferramenta de migração; `docs/DECISIONS.md` D40; `AGENTS.md`, `roadmap.md`, relatório/provas.

## Limites / ainda não certificado
- Não foi regravado Hotel Alqueva real. O template antigo precisa de nova gravação para recuperar dados que nunca guardou.
- Texto livre já contendo nomes/moradas/contactos não estruturados exige revisão editorial: a limpeza cobre campos e tokens/identidade conhecida, não garante anonimização de toda a prosa arbitrária. Não declarar proteção universal concluída.
- Casos mistos de seleção com fases incompatíveis param explicitamente: não apagam secções não selecionadas. Não há assistente de correspondência manual de fases.
- Valores fixos de pagamentos sem orçamento de fase precisam de tratamento adicional (a conversão percentual atual não certifica avenças/fixos sem denominador). Não usar nesses casos sem revisão.
- Casos específicos com fornecedores, texto de carta personalizado, datas dentro de JSON editorial/calculadora e concorrência entre editores não tiveram validação completa nesta entrega. Fonte Alqueva não contém serviços/custos de fornecedores.
- Não construído histórico editorial de revisões adicionais: optou-se por cópia automática reversível. Sem alterações de permissões, políticas de ficheiros ou B1; integração fiscal não construída.

**Conclusão:** fluxo principal e paridade Alqueva completos no template novo; não certificar todos os casos como seguros para publicar enquanto os limites de identidade textual/pagamentos sem denominador e validação seletiva acima estiverem pendentes.
