# Item 3 — Faturas a emitir

## Plano de implementação (registado antes do código)

1. Criar página Finance «Faturas a emitir», com entrada restrita ao módulo Finance e leituras limitadas aos projetos Financials autorizados; os valores/datas operacionais vêm exclusivamente de `pm_project_incoming_timing`.
2. Acrescentar confirmação «Pronto a faturar» no separador Recebimentos do projeto, pelo helper de datas ou Finance, com nota opcional e auditoria de autor/hora. Não altera valores, IVA ou termos.
3. Guardar emissão manual com número/data por ação fiscal autorizada e auditada; reutilizar congelamento do item 2. Estados de apresentação: Planeado → A vencer (até 14 dias, inclusive, ou passado) → Confirmado pelo gestor → Emitido → Pago. Pagamentos reais continuam no fluxo existente.
4. Agrupar pendentes por Em atraso / Esta semana / Próximos 14 dias / Mais tarde este mês; incluir estados emitidos/pagos e datas indefinidas em vistas explícitas, sem esconder história ou inventar datas. Mostrar cliente, fase, montante, datas, confirmação e desvio contratual.
5. Avisos: vencidos não emitidos, até 14 dias sem confirmação e alterações de datas por gestores desde segunda-feira desta semana (Lisboa). Sem emails.
6. Previsão mensal por data esperada de pagamento da projeção do item 2, preservando offsets, overrides e datas congeladas. Valores pagos não entram em recebimentos futuros.
7. Adicionar EN/PT, testes unitários e testes completos num único projeto descartável; snapshots, eliminação exata e zero independente. Guardar capturas e ficheiros alterados neste relatório. Sem dados reais alterados e sem implementar Fase B.

## Decisões técnicas

- Confirmação e emissão são ações de base de dados com autorização por projeto, bloqueio da linha e auditoria, não atualizações livres do navegador.
- A projeção existente mantém a propriedade dos cálculos; a página não lê datas da proposta nem recalcula recebimentos por outra fonte.
- Confirmar requer data operativa válida; alterações posteriores da data tornam a confirmação anterior desatualizada, sem apagar auditoria.

## Execução

Em curso; resultados, capturas e limpeza serão acrescentados após verificação.