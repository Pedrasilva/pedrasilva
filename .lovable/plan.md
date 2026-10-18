# Corte de planeamento — 19 outubro 2026

## Resultado da análise, sem alterações aos dados

Foram lidas as **94 alocações atuais**, todas em projetos ativos. Nenhuma foi alterada; tarefas, horas, propostas e férias permanecem intactas. O corte **não deve avançar ainda**, porque o registo de horas pode voltar a criar marcadores de planeamento futuro.

### Pré-visualização por projeto

“Encurtar” significa manter o mesmo ID e passar apenas a data final para **16/10/2026**. “Retirar” significa marcar como retirado do planeamento, nunca apagar. As avenças ficam pendentes de decisão nesta tabela.

| Projeto | Encurtar | Retirar | Intocadas | Das intocadas: motivo especial |
|---|---:|---:|---:|---|
| 0410B Telheiras Obra | 0 | 0 | 11 | 2 alocações mensais pendentes |
| 0434 Sérgio Varanda | 1 | 0 | 5 | 1 alocação mensal pendente |
| 2028 CTR Capital Towers Restaurant | 1 | 0 | 0 | — |
| 2101 Colares | 3 | 0 | 0 | — |
| 2128 Sandycove Road Dental Clinic | 0 | 0 | 2 | — |
| 2502 Uralchem IV | 0 | 0 | 12 | — |
| 2506 Apartamento Tiago Carreiras | 0 | 0 | 1 | — |
| 2521 Escritórios BCG | 4 | 0 | 13 | — |
| 2522 Escritórios Banco CTT – Atrium 2 | 0 | 0 | 11 | 5 protegidas; 2 futuras com horas |
| 2600 Quelhas | 0 | 0 | 2 | — |
| 2608 Alcanena | 0 | 0 | 11 | — |
| 2609 Mastercard | 3 | 0 | 8 | — |
| 2663 Alteração de loteamento – Ericeira | 0 | 0 | 3 | — |
| Bolshaya | 0 | 0 | 3 | — |
| **Total** | **12** | **0** | **82** | **3 mensais pendentes; 5 protegidas; 2 futuras com horas** |

As 12 alocações a encurtar são **marcadores de atribuição com 0h/dia**, não reservas de capacidade. Existem horas registadas ligadas a estes marcadores; todas serão preservadas. Não existem alocações começadas em 17–18 outubro nem alocações futuras elegíveis para retirada sem horas.

### Horas planeadas removidas a partir de 19 outubro

| Colaborador | Alocações a encurtar | Horas planeadas removidas |
|---|---:|---:|
| Bernardo Nadais | 1 | 0h |
| Francisco Oliveira | 2 | 0h |
| Irene Cunha | 2 | 0h |
| João Almeida | 1 | 0h |
| Luis Pedra Silva | 1 | 0h |
| Mariana Oliveira | 1 | 0h |
| Patricia Reis | 2 | 0h |
| Ricardo Conceição | 1 | 0h |
| Rita Saragoça | 1 | 0h |
| **Total** | **12** | **0h** |

Todos os restantes colaboradores: **0h removidas**. O cálculo usa dias úteis, exclui feriados e fechos do Atelier, e multiplica pelas horas/dia guardadas; não converte estimativas comerciais em horas planeadas nem subtrai férias individuais ao valor base do Gantt.

### Exceções que ficam intactas

- **Banco CTT:** 5 alocações protegidas por fases bloqueadas; 3 dessas alocações são também importadas e bloqueadas. Apenas uma das cinco ainda cruza 19 outubro: Mariana Oliveira, fase “Projecto”, 31/07–30/12/2026, 22h registadas. Bloqueios de fases também são respeitados, sem os contornar.
- **Banco CTT:** 2 alocações começam em **01/01/2027**, terminam em **02/04/2027**, e já têm horas: Francisco Oliveira **16,75h / 5 atividades**; Rita Saragoça **8h / 1 atividade**, ambas na fase guardada como “F4 - Mês 3 - Setembro”. Datas/nome aparentemente inconsistentes, mas ficam intactos conforme pedido. Não corrigir nem retirar automaticamente.
- Assim, respeitando estas exceções, o resultado não será uma folha completamente vazia: ficam visíveis os marcadores protegidos e os futuros com horas. Isso é uma consequência das regras, não autorização para os apagar.

## Avenças: funcionamento e proposta

**0410B** tem 18 fases mensais (junho 2026–novembro 2027) e 10 alocações de 0h; **0434** tem 12 fases mensais (junho 2026–maio 2027) e 5 alocações de 0h. O registo de horas apresenta a avença agregada e atribui cada atividade à fase do respetivo mês, através de uma tarefa ligada à alocação. As fases mensais, datas e honorários não devem ser cortados.

Só **3 alocações mensais** cruzam o corte, todas em outubro e com 0h/dia:
- 0410B: Bernardo Nadais (**23,5h**, 4 atividades) e Irene Cunha (**3,5h**, 3 atividades).
- 0434: Rita Saragoça (**0,5h**, 1 atividade).

**Proposta, após corrigir o registo de horas:** encurtar estas três alocações para 16 outubro, mantendo fases mensais, tarefas e todas as atividades; novas atribuições de capacidade ficam exclusivamente no quadro semanal. Futuros meses continuam disponíveis para registar horas sem criar planeamento. Se aprovada esta opção, o total passa a **15 encurtadas / 0 retiradas / 79 intocadas**, ainda **0h planeadas removidas**. Não existem atualmente alocações destas avenças com início a partir de 19 outubro.

## Ponto crítico: registo de horas

**Não posso confirmar a garantia pedida para todas as pessoas/fases sem corrigir o caminho atual.**

- A escolha de projetos/fases não exige uma alocação futura: oferece projetos ativos e fases ativas, internas e sem subfases, mais os meses de avença. Fases concluídas/planeadas continuam sem aceitar novas horas, salvo a exceção mensal existente; não serão ativadas automaticamente.
- Uma tarefa já existente permite registar horas depois da data final da alocação; a proteção das horas não verifica essa data. Encurtar para 16 outubro, por si só, não impede o registo em 19 outubro. Alocações retiradas também continuam ligadas às tarefas e ao histórico.
- **Sem alocação**, o caminho atual cria uma alocação de **0h com todas as datas da fase** para obter uma tarefa. As permissões atuais permitem autoatribuição e uma rotina cria a tarefa; não é um bloqueio geral de permissões. Porém, este comportamento voltaria a introduzir marcadores futuros no Gantt/quadro, contrariando a folha limpa.
- A procura também presume uma só alocação por pessoa/fase. Há já um caso duplicado, Mariana Oliveira em Mastercard; novas publicações semanais podem multiplicar essas alocações. O caminho pode falhar ou criar mais uma alocação em vez de reutilizar uma tarefa. Nada será fundido ou eliminado.
- Esta conclusão foi verificada no código e nas regras atuais da base de dados; **não foi efetuado um registo de teste em projetos reais** nem uma prova de gravação com conta de colaborador.

### Correção a aprovar primeiro

Criar um caminho único e seguro para preparar a linha de horas do próprio colaborador, usado pelo registo manual, assistente e calendário:
1. Reutilizar deterministicamente uma tarefa válida existente da pessoa/fase, independentemente das datas ou retirada do planeamento; suportar várias alocações sem as fundir.
2. Quando não existe tarefa, criar apenas a ligação técnica mínima necessária ao modelo atual: um marcador de 0h **já retirado do planeamento**, com a sua tarefa. Não é uma reserva futura, não aparece no quadro/Gantt planeado, e continua a permitir guardar atividades. Não mexer nos IDs/links históricos nem abrir permissões gerais de planeamento.
3. Manter as regras atuais de acesso, fases ativas, semanas bloqueadas, aprovação e custos guardados; impedir duplicados concorrentes.
4. Validar em cópias isoladas: sem alocação, alocação terminada em 16/10, retirada, várias alocações, mês de avença e colaborador sem direitos de planeamento. Confirmar gravação e leitura das horas em 19/10, sem novos marcadores futuros. Só então reapresentar o corte para aprovação final.

## Fotografia e reversão em um passo

**Não foi guardada uma fotografia na base de dados nesta análise**, para respeitar “sem alterações”. Antes do corte aprovado, guardar uma fotografia duradoura das linhas completas a alterar, com IDs, estado anterior, estado esperado depois do corte e resumo de verificação. Não depender do Undo temporário do Gantt nem de uma reposição integral da base de dados.

- Guardar a fotografia e aplicar o corte na mesma transação; rejeitar uma pré-visualização desatualizada.
- Um único comando de reversão repõe apenas os campos de planeamento alterados nestes IDs, numa transação. Tarefas, horas novas/antigas, custos, aprovações e férias nunca são restaurados por cima.
- Se houver planeamento editado/publicado entretanto, a reversão deve parar e listar o conflito, em vez de apagar trabalho posterior. “Um passo” não significa contornar estes conflitos.
- Confirmar contagens, horas históricas e linhas não abrangidas antes/depois; não enviar notificações do corte nem recriar entradas.

## Detalhes técnicos para implementação após aprovação

- `useProjectSearch` / `useEnsureStageRow` em `src/lib/projects/use-timesheet.ts` e os consumidores partilhados são os pontos de escolha/preparação; a procura atual usa `maybeSingle()` sem tratar múltiplas alocações.
- As permissões atuais de autoatribuição e o trigger `pm_create_task_for_allocation` foram lidos diretamente. O trigger `pm_time_entry_active_stage_guard` não impõe datas da alocação.
- Manter `planning_removed_at` como fronteira de planeamento, não de histórico; nenhuma cascata, mudança de snapshots, fases, propostas ou férias.
- Alterações de estrutura/permissões, se necessárias, passam por migração com cópia idêntica em `supabase/migrations`; fotografia e operações são restritas aos responsáveis autorizados.

## Aprovação agora

**Aprovar primeiro a correção do registo de horas e decidir se as três alocações mensais seguem o corte proposto.** O corte não será aplicado nesta aprovação inicial: haverá nova confirmação após verificar a correção e atualizar esta pré-visualização.