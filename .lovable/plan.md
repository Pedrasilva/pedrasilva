# Um único Gantt para CRM e Projetos

## Diagnóstico confirmado

- O desenho base já é comum, mas há dois painéis, toolbars, paletas e tratamentos financeiros. A unificação anterior foi parcial.
- Orçamento no painel operacional fica sempre bloqueado por `planningOnly`, até para Luis; a coluna inline tem ainda um bloqueio por proposta de origem. Ricardo tem permissões de planeamento e etapas e é PM de Mastercard.
- Nulty conserva `is_self=false`, cor e source ID, mas perdeu o papel operacional e a identidade do fornecedor; o fallback desenha Arquitetura.
- A linha de Outubro de 285 € não existe atualmente em Mastercard. A linha com esse nome pertence a Banco CTT e vale 2 115 €. Mastercard F5 vale 77 000 €.
- O contrato de referência legado de Mastercard tem total zero e nenhuma fase; não permite mostrar valores contratados como se estivessem comprovados.

Inventário completo e referências: `docs/project-proposal-gantt-investigation-2026-11-11.md`.

## 1. Uma experiência única

Construir um único Gantt com um único painel de fase/projeto, toolbar, paleta, iconografia, hierarquia e estilos de fornecedor. CRM, projeto direto, projeto convertido e Gantt global usam essa mesma experiência; adaptadores apenas leem/gravam o contexto correto.

- Mesmos campos e disposição: nome, categoria, fornecedor/“Somos nós”/descrição provisória, cor, marco, datas/duração, dependências, recursos, orçamento interno, honorário atual, referência contratual, faturação e histórico.
- Mesmos gestos, Reflow, Undo/Redo de planeamento, seleção, zoom/equipa/PDF e regras de resumos; permissões desativam campos, não substituem o painel por outro.
- Fornecedores externos sempre identificados por ícone e barra tracejada/hachurada; Arquitetura e “Somos nós” usam o mesmo resolvedor em ambos os contextos.
- Avenças seguem o mesmo editor abaixo das fases regulares, com referência/valor atual e mensalidades operacionais quando aplicável; não duplicar valores entre pai e meses.
- Únicas diferenças live: datas reais/feriados/fechos, progresso, horas/custos registados, férias/capacidade e estados fiscais. Proposta draft usa semanas relativas; convertida abre o projeto live sem gravar na proposta.

## 2. Separar planeamento interno de compromisso com o cliente

| Valor/ação | Quem pode alterar num projeto live |
|---|---|
| Orçamento interno, objetivo de horas, alocações e planeamento | PM do próprio projeto, mediante autorização operacional; administração mantém supervisão |
| Honorário atual ao cliente, condições/modelo comercial e montantes do plano de pagamentos | Finance autorizado: Luis e Tatiana; visibilidade financeira de Ricardo/Irene não concede esta escrita |
| Contratado — proposta aceite/contrato de referência | Nunca editável pelo Gantt |
| Datas de previsão de recebimento | Manter ação auditada e autorização específica existente; não conceder edição de montantes por consequência |
| Faturas emitidas/pagamentos confirmados | Permanecem fiscalmente protegidos; não alterar através do Gantt |

No CRM draft permanece a autorização comercial existente; a restrição Finance acima aplica-se a compromissos de projetos live, não impede preparar propostas.

**Orçamento interno não é honorário.** Não usar `pm_stages.budget` simultaneamente para os dois. A proposta define um plano interno e honorários; a conversão copia-os para valores operacionais independentes, mantendo evidência aceite.

## 3. Contratado vs Atual, em cada fase e nos totais

- Mostrar **Contratado** bloqueado ao lado de **Honorário atual** editável por Finance; **Orçamento interno** e **Horas planeadas** separados, editáveis pelo PM autorizado.
- Mostrar **Alterado vs contrato**, diferença em euros e percentagem quando o contratado não é zero. Diferenças internas identificadas como planeamento, sem chamar “contratado” a um orçamento não acordado.
- Totais seguem as mesmas regras das folhas; pais são resumos, fornecedores/refaturação e avenças contam uma única vez. Valores negados ou referência incompleta aparecem indisponíveis, nunca zero inventado.
- Uma fase nova sem referência é “Fora do contrato”; uma fase sem evidência histórica é “Referência por confirmar”, não “Contratado 0 €”.
- Mudança de honorário/condições/pagamentos cria **Aditamento contratual necessário**; mudança só de orçamento interno/horas não modifica honorários, faturas, recebimentos ou contrato.
- Motivo curto obrigatório para mudanças de valores/objetivos financeiros. Histórico append-only: pessoa, data/hora, fase/projeto, domínio, valor anterior/novo, motivo e revisão. Operação e auditoria guardadas juntas; conflitos não sobrescrevem alterações alheias. Undo de planeamento mantém o fluxo atual; correções financeiras são novas ações auditadas, nunca apagam histórico.

## 4. Dados históricos e conversão

- Novas conversões preservam papel, fornecedor/placeholder, “Somos nós”, cores, plano interno e honorário por identificadores estáveis do snapshot aceite; sem sincronização pós-conversão.
- Projetos live guardam identidade operacional própria, independente da hierarquia mutável da proposta.
- Mastercard mantém proposta, baseline, origem e badge exatamente como Luis decidiu. Mostrar falta de referência contratual; não transformar o baseline vazio/zero em contrato válido nem reconstruí-lo silenciosamente.
- Preparar lista read-only dos casos legados com metadados ausentes e evidência disponível. Qualquer correção persistente de projeto real exige lista exata de linhas e autorização separada. Nenhum backfill em dados reais por aprovação deste plano.

## 5. Detalhes técnicos

- Extrair estado/layout/toolbar/painel partilhados de `planner-gantt.tsx`; substituir os dois inspectors por um único painel com adaptadores tipados e capabilities por campo.
- Unificar `buildProjectGanttTree` e projeção CRM num resolvedor de apresentação; categorias comerciais/fornecedor e “Somos nós” consistentes, sem fallback silencioso de externo para Arquitetura.
- Acrescentar armazenamento operacional distinto para orçamento interno/horas-alvo e honorário corrente; referências imutáveis com IDs estáveis e estado de completude. Reutilizar as tabelas de contrato existentes, sem regravar snapshots, baseline ou propostas.
- Ações auditadas verificam caller, projeto, domínio e revisão na base de dados. Proteger os campos sensíveis também contra UPDATE direto; inventariar políticas permissivas `psa_staff_only` e todos os caminhos de edição, sem alargar acesso de leitura nem modificar `public.user_roles`.
- Permissões Finance mediante capabilities verificadas no servidor, atribuídas às contas aprovadas de Luis/Tatiana — nunca nomes, emails ou estado do navegador como autorização. Apresentar a matriz de escrita proposta antes de ativar regras que retirem acessos.
- Migrações aditivas idênticas em `supabase/migrations` e `drizzle/migrations`, com GRANT/RLS e revogação TRUNCATE onde se criem tabelas. Traduções EN/PT juntas; sem novos literais ou alteração de documento.
- B1 permanece OFF, revisão 10; não alterar gates, projeções B1 ou iniciar B2/B3.

## 6. Validação após aprovação

Uma fixture descartável de cada vez: proposta sintética, projeto direto e cópia convertida de Mastercard; nenhuma edição na Mastercard real.

1. Comparar os mesmos campos, toolbar, paleta, barras fornecedor e avenças nas entradas CRM/projeto/global; desktop e largura menor.
2. PM da fixture altera orçamento interno/horas no próprio projeto, grava/recarrega; outro PM sem atribuição é recusado. Permissão apenas de leitura não escreve.
3. Finance altera honorário corrente com motivo; Contratado permanece igual, delta e aditamento surgem. PM/admin sem capability Finance é recusado na ação e no UPDATE direto.
4. Valores e fornecedor sobrevivem a conversão por IDs, sem leitura contínua da proposta atual. Baseline incompleto não fabrica referência nem percentagens.
5. Testar resumos/avenças/refaturação sem duplicação, motivo obrigatório, auditoria, concorrência, e proteção fiscal.
6. Verificar datas/dependências/arrasto/resize/Undo, horas e snapshots bloqueados, planeamento semanal e impressão; sem regressões.
7. Comparar hashes de proposta/snapshot/baseline/horas/pagamentos; eliminar fixtures e confirmar zero por leitura independente. B1 OFF antes/depois.

**Ponto de paragem:** aguardar o OK de Luis antes de implementar. Aprovação do plano não autoriza reconstruir contratos nem corrigir dados reais legados.