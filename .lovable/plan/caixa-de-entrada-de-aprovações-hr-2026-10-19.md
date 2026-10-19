# Caixa de entrada de aprovações HR

## Verificação antes de construir
- Férias, ausências e baixas: `vacation_requests`; alterações: `vacation_change_requests`; teletrabalho: `remote_work_requests`.
- Férias/ausências: `can_approve_leave` verifica `hr.leave.approve` no âmbito Tudo, incluindo o acesso administrativo existente. Alterações: só o destinatário pode decidir, nunca o próprio requerente. Teletrabalho: permissões HR existentes ou aprovadores designados, respeitando o colaborador abrangido.
- Patricia Reis tem atualmente **um** pedido pendente: baixa de 08–09/10, sem comprovativo. A ausência não paga já está aprovada; não há alterações nem teletrabalho pendentes. «Pendentes 0» representa dias de **férias** pendentes, não o número de pedidos. Não alterar este cálculo.
- Motivo de rejeição obrigatório para ausências e alterações, conforme confirmado. Teletrabalho mantém a regra atual.

## Página e menu
- Criar `/hr/aprovacoes`, «Aprovações», imediatamente abaixo de «Absence & leave» no menu HR, com contador dos pedidos pendentes abrangidos pelo acesso do aprovador.
- Página acessível apenas a quem pode aprovar algum dos tipos. Aprovadores de ausências veem a equipa abrangida; quem só aprova teletrabalho não recebe acesso adicional a ausências ou comprovativos.
- Uma tabela, mais antigos primeiro: colaborador, tipo, início, fim, dias, notas, comprovativo, submissão, dias de espera e saldo atual de férias. Alterações mostram a mudança pedida; teletrabalho identifica meios dias.
- O saldo reutiliza a fórmula existente, que já desconta férias pendentes; nunca descontar o mesmo pedido duas vezes. Ausências, baixas e teletrabalho não passam a consumir férias. Para alterações ainda não aplicadas, não antecipar uma mudança ao saldo atual.
- Filtros por tipo e colaborador; estado vazio «Sem pedidos pendentes».

## Decisões e atualização
- «Aprovar» / «Rejeitar» por linha, com motivo conforme as regras existentes.
- Seleção múltipla e «Aprovar selecionados»: cada pedido passa pela mesma verificação individual atual. Pedidos próprios, alterações destinadas a outra pessoa e baixas sem comprovativo não podem ser aprovados por esta via.
- Mostrar erros por pedido e manter na tabela os que não foram decididos; retirar os concluídos e atualizar contadores/saldos sem recarregar a página.
- Manter histórico, notificações, emails e sincronização de ausências existentes.

## Links e Mapa de Férias
- `/hr/aprovacoes?pedido=<id>` destaca o pedido e torna-o visível mesmo quando filtros o ocultariam.
- Se já decidido, apresentar resultado, pessoa e data através dos registos existentes; não permitir nova decisão.
- Sem sessão, usar o login existente e regressar ao mesmo caminho e parâmetro; nenhum detalhe privado antes de entrar.
- No dropdown «Ver saldo de…», contador de **pedidos** pendentes junto a cada nome, separado dos dias de férias pendentes do cartão.
- Traduzir as ações para «Aprovar/Rejeitar», mantendo EN/PT em paridade.

## Detalhes técnicos
- Reutilizar os controlos, autenticação, permissões e consultas existentes; não criar novas tabelas nem modificar cálculos.
- Ausências e alterações continuam a chamar `leave_decide_pending` e `leave_change_decide`; nenhuma escrita direta alternativa.
- Verificar a autorização no servidor para leitura da caixa e para cada decisão de teletrabalho, usando `remote_work_can_approve` por colaborador e as regras atuais. Não confiar apenas na visibilidade dos botões nem alargar permissões.
- Consultas, contador do menu e contador por colaborador partilham os mesmos critérios. Após decisões, invalidar apenas as consultas HR afetadas.
- Se for necessário um novo ponto de acesso protegido para agregar leituras/decisões, será aditivo, sem substituir a lógica existente; qualquer migração terá cópia idêntica nas duas pastas de migrações.

## Verificação
- Testes concretos de pendentes por tipo/colaborador, ordenação, permissões, motivo obrigatório, comprovativo e preservação do saldo.
- Verificação no ecrã de filtros, decisão individual, seleção múltipla, atualização dos badges, pedido já decidido e retorno após login.
- Decisões de teste apenas em cópias isoladas, eliminadas no fim; nenhum pedido real será aprovado ou rejeitado.