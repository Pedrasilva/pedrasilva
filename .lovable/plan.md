# Horas previstas por honorários

## Situação atual
A lista soma reservas de alocação, não estima esforço por honorários. Assim Mint/Alcanena mostram zero, Mastercard 24 h e Uralchem 1 021 h. Luis confirmou: **alocações ficam separadas da estimativa; só um alvo manual explícito prevalece**.

Investigação sem alterações de código/políticas/dados; B1 OFF. D44 regista a regra confirmada e substitui apenas o default provisório de D09. Construção aguarda aprovação deste plano.

## Cálculos pedidos — somente leitura
Média simples da equipa explícita faturável, sem Backoffice; nenhum override de projeto encontrado nestes quatro casos.

| Projeto | Fee interno | Taxa média atual | Horas por fee à taxa atual | Taxa simulada ×1,5 | Novo previsto est. | Reservas atuais |
|---|---:|---:|---:|---:|---:|---:|
| Clinica Mint II | 30 980 € | 55,555 €/h | 557,65 h | 47,625 €/h | 650,50 h | 0 h |
| Alcanena | 23 050 € | 60,155 €/h | 383,18 h | 51,560 €/h | 447,05 h | 0 h |
| Mastercard | 315 000 € | 61,920 €/h | 5 087,21 h | 53,080 €/h | 5 934,44 h | 24 h |
| Uralchem IV | 651 200 € | 67,670 €/h | 9 623,17 h | 58,010 €/h | 11 225,65 h | 1 021 h |

Simulação usa custo HR atualmente devolvido e arredondado; cálculo final antes do arredondamento pode diferir centésimos. Mastercard exclui fornecedores externos; Mint conta avença de 4×1 320 € só uma vez. Uralchem tem apenas Ricardo Conceição na equipa explícita: mostrar este facto, sem alterar equipa.

Uralchem: **20×6 + 53×(1,6+1+2,4+6+6)=1 021 h**, reservas atuais calculadas pelos dias úteis; não foi fee/taxa. Mastercard: 3×8=24 h. Os dois valores mantêm-se como «alocado», não como alvo manual.

## O que construir
1. **Taxas consistentes:** default venda = custo HR (quota Backoffice incluída) ×1,5. Preservar overrides explícitos e snapshots históricos; Backoffice sem taxa própria. Recomendar **média simples** da equipa faturável: estável, não muda com horas registadas/reservas. Equipa vazia usa média simples das pessoas faturáveis **ativas** do atelier; sem custo válido mostrar indisponível, nunca zero. Identificar origem da média para quem tem acesso financeiro.
2. **Orçamento de horas:** fase fee/taxa; avença mensal fee mensal/taxa, somada pelo número de meses; projeto soma valores sem duplicar pais/filhos nem avença/meses. Sem fases usar fee contratual interno. Alvo corrente manual explícito ganha; estimativas levam «est.». Sem fee, «Fee not set»; pai-resumo com filhos valorados soma filhos, não mostra falta de fee. Fornecedores externos não aumentam orçamento de trabalho PSA.
3. **Leitura clara:** usado mantém horas registadas; restante = previsto−usado (negativo permitido). Barra até 100%, âmbar desde **85%**, vermelho apenas **usado > previsto**. Sem fee não há falsa barra vermelha. € gasto é custo real snapshot; € restante=fee−custo real, não venda×horas restantes; ausência de custo continua indisponível.
4. **Mesmos números:** projeção única para lista, página do projeto, painel Gantt e seletores de timesheet que mostrem budgets. Não alterar horas pessoais/semana/alocações/datas/faturas.
5. **Privacidade:** calcular no servidor e devolver horas apenas aos colaboradores sem Financials. Com Financials devolver também gasto/restante em euros; nunca salários brutos. Auditar pedidos da lista e páginas para impedir leaks dos leitores antigos, não apenas ocultar colunas.

## 1,75: locais e impacto
- `src/lib/projects/default-rates.functions.ts`: margem 0,75 →0,5 e nomes/comentários correspondentes.
- `src/lib/projects/use-default-rates.ts`: constante exportada e banda 75% →50%, partilhar default.
- `src/lib/projects/cost-rates.server.ts`: constante 0,75 alinhada, **não altera custo nem snapshots**.
- `financial-calculation.ts`: já não contém 1,75/0,75; recebe default indiretamente do resolvedor e preserva snapshots. Não acrescentar segundo multiplicador.
- `rich-text-editor.tsx` usa 1,75 para entrelinha: não alterar.
- Verificar consumidores indiretos Projects list/detail/forecast/financials e relatórios/controlo de budget. Venda inferida cai 14,2857%; estimativas de horas sobem 16,6667% sem overrides. Margem teórica de venda passa de 42,857% para 33,333%. **Margens sobre fees fixos e custos históricos não devem mudar**; receitas horárias sem snapshot e forecasts valorizados ao default podem mudar.

## Detalhes técnicos e autorização
- Nova projeção autenticada read-only com acesso operacional por projeto antes de leituras privilegiadas HR; mesmo motor puro no servidor e consumidores.
- Gate financeiro existente: `pm_project_rate_access(projectId)` → utilizador autenticado, `is_psa_staff()`, projeto não finance_only, `can_view_project_area(projectId,'financials')`. Sem cargos/emails/storage no cliente; B1 OFF mantém-se.
- DTO hours-only allowlisted: IDs, previsto/usado/restante, origem est./manual e estado; sem fee, média/taxas, custo, snapshots financeiros. DTO financeiro opcional só após gate. Cache segregada por utilizador/permissões/projeto; auditar leitores brutos existentes.
- Alvo manual novo separado nullable (sem backfill) e ação autorizada, porque `baseline_target_hours` é referência bloqueada e 160 h mensais é default de capacidade, não valor manual. Migração idêntica nos dois diretórios se necessário; nenhuma alteração aos registos reais na implementação.
- Glossário/chaves EN+PT e WBS partilhados; não alterar línguas de documentos ou enumerados.

## Validação antes de entregar
- Testes concretos: 100 000 €/100 €/h=1 000 h; manual prevalece; alocações não prevalecem; 12×2 000 € por mês; sem fee; sem taxa; hierarquia; 84,99/85/100/100,01%; snapshots/overrides intactos.
- Só cópias descartáveis: verificar lista→projeto→Gantt→picker, administrador/Financials/colaborador sem acesso/sem acesso ao projeto. Inspecionar tráfego e chamadas diretas para comprovar ausência de euros/taxas e isolamento entre projetos.
- Comparar fees e entradas originais antes/depois em leitura, B1 OFF, limpeza de cópias; executar testes seletivos/i18n e reportar resultados e limites.

## Fora de âmbito
Sem backfill de rates/fees/horas, sem alteração de equipas reais ou snapshots, sem B1/cutovers, sem mudanças fiscais ou de políticas de armazenamento. Regras aprovadas no documento de decisões não constituem aprovação para construir: aguardar OK deste plano.