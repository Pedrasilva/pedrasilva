# Gantt partilhado — modelo simplificado

## Fase 1 — autorizada
- CRM, Projetos e vista global usam o mesmo Gantt, painel, ferramentas, cores e estilo de fornecedores: ícone e barra hachurada.
- Preservar a identidade do fornecedor nas novas conversões; corrigir a apresentação de Nulty pelo sinal operacional existente, sem reconstruir dados reais.
- Quem tem acesso financeiro a um projeto pode editar o seu Gantt, fases, valores, recursos e avenças. Reutilizar a autorização existente, verificada no servidor, sem regras por cargo/nome/email.
- Referências contratuais legadas vazias mostram “Referência por confirmar”, nunca zero inventado.
- Preservar faturas emitidas, pagamentos confirmados, horas e B1. Testar somente cópias descartáveis e confirmar eliminação.

## Fase 2 — aguarda OK de Luis
- Datas livres; previsões de pagamento seguem as fases, sem alterar evidência fiscal.
- Contratado imutável vs Atual; subfases podem consumir menos, nunca mais que o valor da fase; custos excedentes apenas avisam.
- Mudança de valor: confirmação de responsabilidade, motivo curto, atualização imediata do plano de faturação/pagamentos e marcador ≠ Contrato.
- Histórico append-only com pessoa real, data, projeto/fase, anterior/novo e motivo, visível por fase/projeto.
- Novas fases permitidas e marcadas Fora do contrato.
- Meses de avença podem prolongar-se; novo valor mensal pede confirmação sobre acordo do cliente/responsabilidade/motivo, aplica-se para a frente e é registado.
- Sem workflows de aprovação. Dados reais só após apresentar as linhas exatas.

## Detalhes técnicos
QuoteGantt, SharedPlannerInspector e PlannerToolbar com adaptadores de armazenamento separados; pm_can_edit_gantt reutiliza Financials e guardas de escrita protegem todas as mutações live. Supplier metadata vem do snapshot aceite por ID. Migrações aditivas espelhadas byte a byte. Sem mudanças B1.
