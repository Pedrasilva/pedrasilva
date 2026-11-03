# Calendário operacional após conversão

## Correspondência e leitura
- Manter `QuotePlanningTab` e a entrada `QuoteGantt`, reutilizando o mesmo `GanttChart` em modo operacional quando `fee_proposals.pm_project_id` estiver preenchido. A existência de `quote_relative_schedules` e as datas de 2000 deixam de determinar o modo de uma proposta convertida.
- Associar cada fase da proposta ao registo do projeto por `pm_stages.source_quote_stage_id`; associar cada alocação por `pm_allocations.source_quote_allocation_id`, verificando também projeto e fase. Não inferir correspondências por nome, posição ou recurso.
- Mostrar as datas atuais dos registos operacionais, preservando a hierarquia/WBS da proposta e a referência à data inicial real do projeto. Não recalcular nem gravar datas ao abrir a página.
- Usar o calendário operacional existente, incluindo feriados e fechos do atelier, para barras, dias úteis e alterações de datas. O cabeçalho mostra meses/semanas reais; o inspetor mostra início/fim.

## Encaminhamento das edições
- Usar os mecanismos existentes do calendário operacional para datas, arrastamentos, cascatas, dependências e Undo, respeitando permissões e proteção de histórico.
- O inspetor operacional permite os campos de planeamento suportados: nome, início/fim, marco, cor, estado, dependências e alocações. As alterações pertencem exclusivamente aos registos operacionais.
- Validar correspondências antes de editar uma fase/alocação proveniente da proposta. Correspondências ausentes ou ambíguas bloqueiam a alteração com mensagem; nunca recorrer à gravação na proposta.
- **Campos do inspetor que continuam a escrever na proposta num projeto convertido: nenhum.**
- Os campos comerciais do inspetor de proposta não serão editáveis neste modo: categoria, fornecedor/identidade própria, refaturação/margem, serviço opcional, orçamento/modo de orçamento, origem do valor de venda, modelo/momento de faturação e faturação independente dos filhos. Permanecem preservados na proposta e no contrato.
- Propostas ainda não convertidas mantêm os seus campos e gravações atuais, em modo relativo quando aplicável.

## Avença abaixo do Gantt
- Mover o bloco `RetainerStageEditor` para depois do Gantt em `QuotePlanningTab`, tanto no construtor como no calendário do projeto.
- No projeto convertido, mostrar a avença contratada apenas para leitura: desativar os controlos e, sobretudo, impedir a sincronização automática de orçamento e qualquer criação automática de fases. O planeamento operacional continua a ser editado no Gantt.

## Limites
- Não alterar `pm_convert_relative_quote`, o contrato de referência, o plano de pagamentos ou quaisquer conteúdos/valores das propostas.
- Sem migrações ou alterações de dados reais previstas.

## Verificação e entrega
- Testes pequenos para precedência da conversão sobre o modo relativo, correspondências corretas/ausentes/ambíguas e bloqueio de destinos de proposta.
- Validar o calendário e o inspetor num projeto convertido com uma cópia descartável para qualquer edição; verificar leitura após gravação e preservação da proposta/contrato/pagamentos. Eliminar as cópias.
- Capturar o calendário em português com datas reais e a avença abaixo, e listar os ficheiros alterados e os testes realizados num relatório.

## Detalhes técnicos
- Implementação concentrada em `quote-planning-tab.tsx`, `planner-gantt.tsx`, no limite de correspondência do planeador operacional e no modo de leitura de `retainer-stage-editor.tsx`.
- Reutilizar `useProjectDetail`, o adaptador operacional e o inspetor operacional, sem redirecionar globalmente os hooks de propostas.
- Resolver permissões pelo caminho já utilizado no calendário do projeto; a segurança continua a ser aplicada pelas políticas e ações existentes.
- Acrescentar mensagens EN/PT-PT em conjunto e executar os testes relevantes e a auditoria de tradução.