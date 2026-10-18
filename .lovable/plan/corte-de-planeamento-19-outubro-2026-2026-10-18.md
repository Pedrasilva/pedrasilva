# Corte de planeamento — 19 outubro 2026

## Aprovação final pendente

**O corte não foi aplicado.** A correção de registo de horas está implementada; a fotografia das 15 alocações a encurtar está guardada. Aplicar apenas após esta confirmação final.

## Pré-visualização atualizada

| Projeto | Encurtar até 16/10 | Retirar | Intocadas |
|---|---:|---:|---:|
| 0410B Telheiras Obra | 2 | 0 | 9 |
| 0434 Sérgio Varanda | 2 | 0 | 4 |
| 2028 CTR Capital Towers Restaurant | 1 | 0 | 0 |
| 2101 Colares | 3 | 0 | 0 |
| 2128 Sandycove Road Dental Clinic | 0 | 0 | 2 |
| 2502 Uralchem IV | 0 | 0 | 12 |
| 2506 Apartamento Tiago Carreiras | 0 | 0 | 1 |
| 2521 Escritórios BCG | 4 | 0 | 13 |
| 2522 Escritórios Banco CTT - Atrium 2 | 0 | 0 | 11 |
| 2600 Quelhas | 0 | 0 | 2 |
| 2608 Alcanena | 0 | 0 | 11 |
| 2609 Mastercard | 3 | 0 | 8 |
| 2663 Alteração de loteamento - Ericeira | 0 | 0 | 3 |
| Bolshaya | 0 | 0 | 3 |
| **Total** | **15** | **0** | **79** |

Todos os candidatos são marcadores de **0h/dia**: **0h planeadas removidas**, por pessoa e no total. Mantêm os IDs, tarefas e todas as horas registadas. As três alocações mensais de outubro aprovadas estão incluídas: Bernardo e Irene em 0410B; Rita Saragoça em 0434. Fases mensais, honorários, propostas e férias ficam intactos.

| Colaborador | Encurtar | Horas planeadas removidas |
|---|---:|---:|
| Bernardo Nadais | 2 | 0h |
| Francisco Oliveira | 2 | 0h |
| Irene Cunha | 3 | 0h |
| João Almeida | 1 | 0h |
| Luis Pedra Silva | 1 | 0h |
| Mariana Oliveira | 1 | 0h |
| Patricia Reis | 2 | 0h |
| Ricardo Cabrita | 0 | 0h |
| Ricardo Conceição | 1 | 0h |
| Rita Costa | 0 | 0h |
| Rita Saragoça | 2 | 0h |

## Banco CTT — to review (intocadas)

| Colaborador | Fase guardada | Datas | Motivo |
|---|---|---|---|
| Francisco Oliveira | Projecto | 26/12/2025–18/06/2026 | Fase bloqueada; alocação importada e bloqueada |
| Luis Pedra Silva | Projecto | 26/12/2025–18/06/2026 | Fase bloqueada |
| Mariana Oliveira | Projecto | 31/07–30/12/2026 | Fase bloqueada; 22h registadas |
| Ricardo Conceição | Projecto | 26/12/2025–18/06/2026 | Fase bloqueada; alocação importada e bloqueada |
| Rita Costa | Projecto | 26/12/2025–18/06/2026 | Fase bloqueada; alocação importada e bloqueada |
| Francisco Oliveira | F4 - Mês 3 - Setembro | 01/01–02/04/2027 | 16,75h / 5 atividades |
| Rita Saragoça | F4 - Mês 3 - Setembro | 01/01–02/04/2027 | 8h / 1 atividade |

Estas exceções impedem uma folha completamente vazia: preservá-las é deliberado. O nome da fase futura parece inconsistente com as datas; não foi corrigido.

## Registo de horas e verificação

- Reutiliza tarefas existentes de forma determinística, mesmo com alocação terminada, retirada ou múltiplas alocações; não funde nenhuma.
- Sem ligação adequada, cria uma ligação técnica retirada de 0h, invisível no planeamento semanal/Gantt planeado.
- Mantém o acesso normal à fase/projeto e ao próprio colaborador; não abre direitos de planeamento, não altera alocações bloqueadas/importadas existentes.
- Fases ativas internas sem subfases continuam disponíveis sem alocação futura; a exceção dos meses de avença mantém os limites mensais. Fases fechadas não passam a aceitar novas horas.
- Casos em cópias temporárias passaram: sem alocação, terminada em 16/10, retirada, múltiplas alocações, mês de avença, fases inválidas, outro colaborador, semana aprovada, corte/undo e preservação de custos/atividades. Inclui gravação/leitura em 19/10 como colaborador sem direitos de planeamento, com as suas permissões normais, em transação integralmente anulada.
- No ecrã, Luis guardou 1h15 em 19/10 numa cópia persistida sem planeamento e a atividade reapareceu após recarregar; ligação retirada de 0h, aprovação pendente e custo guardado confirmados. Cópia e atividade de teste eliminadas. Não foi usada uma sessão de navegador de outro colaborador.
- 60 testes de regressão passaram; compilação sem erros.

## Fotografia e reversão

Fotografia preparada: `c34e66f5-5b87-4e19-b10d-8267cedd831c` — **15 linhas**, ainda em estado preparado, sem corte aplicado.
A aplicação exige confirmação explícita, revalida a fotografia e atualiza apenas datas/retirada numa transação. Alterações entretanto tornam a pré-visualização desatualizada e impedem a aplicação.
A reversão em um passo repõe apenas os campos de planeamento desses IDs. Não substitui tarefas, atividades, custos, férias nem dados novos; bloqueia se as alocações forem editadas ou uma semana publicada depois do corte. Aplicação e reversão foram exercitadas apenas na cópia.

## Detalhes técnicos

- Preparação partilhada: `pm_ensure_timesheet_task`, chamada por `useEnsureStageRow`; registo manual, assistente e calendário reutilizam o mesmo caminho.
- Fotografia/preview/apply/undo restritos a administradores PSA; bloqueios transacionais e revisão protegem contra concorrência.
- Todas as alterações de base de dados têm cópias idênticas em `drizzle/migrations` e `supabase/migrations`; nova tabela protegida e sem TRUNCATE para anon/authenticated.

## Decisão solicitada

**Confirmar o corte das 15 alocações até 16 outubro, preservando as 79 restantes e as sete exceções Banco CTT acima.** Nenhuma semana será aprovada por esta operação.
