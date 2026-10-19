# Saldo inicial de férias — 1 de junho de 2026

## Comparação antes de aplicar

Consulta dos valores atuais em 19/10/2026. Todos os números são dias.

| Pessoa | Saldo atual hoje | Novo Disponível total | Férias contadas desde 1/6 | Novo Saldo atual |
|---|---:|---:|---:|---:|
| Bernardo Nadais | 7 | 23 | 16 | 7 |
| Francisco Oliveira | 20 | 18 | 6 | 12 |
| Irene Cunha | 40 | 18 | 0 | 18 |
| João Almeida | 8,5 | 20,5 | 13,5 | 7 |
| Luis Pedra Silva | −1 | 15 | 23 | **−8** |
| Mariana Oliveira | 22 | 22 | 0 | 22 |
| Patricia Reis | 5 | 23 | 17 | 6 |
| Ricardo Conceição | 1 | 16 | 21 | **−5** |
| Tatiana Shchenina | 7 | 18 | 11 | 7 |

**O saldo atual já desconta férias futuras aprovadas ou pendentes de 2026**, não apenas férias gozadas até hoje. Neste momento, todas as férias contadas na tabela estão aprovadas; não há férias pendentes destas nove pessoas. Inclui, por exemplo, os 5 dias de Luis de 26–30/10, os dias de Ricardo de 30/10 e 28–31/12, e os 5 dias de Tatiana de 24–31/12.

- Luis fica com **−8 dias** e Ricardo Conceição com **−5 dias** pelas regras pedidas; os valores negativos não serão ocultados nem corrigidos automaticamente.
- Tatiana tem 4 dias anteriores a 1/6: continuam visíveis, mas deixam de descontar. Nenhuma das outras oito pessoas tem férias aprovadas/pendentes anteriores a essa data em 2026.
- O valor atualmente guardado em «Saldo anterior» é +4 para Francisco e +18 para Irene; será substituído **no cálculo e na apresentação de 2026** pelos ajustes −4 e −4, sem somar os valores antigos ao saldo inicial.

### Pessoas que não serão alteradas

| Pessoa | Disponível total hoje | Férias descontadas de 2026 | Saldo atual hoje |
|---|---:|---:|---:|
| Adalberto Duarte | 22 | 0 | 22 |
| Rita Saragoça | 22 | 0 | 22 |
| Ricardo Cabrita | 22 | 1 | 21 |

## O que será feito após aprovação

1. Guardar os nove ajustes numa tabela de saldos iniciais, com pessoa, ano, data de referência e ajuste. Permitir a sua correção na área existente de gestão do colaborador, apenas a quem já pode gerir estes dados.
2. Para estas nove pessoas, usar em 2026 exatamente **22 + ajuste** como «Disponível total». O cartão «Saldo anterior» mostra o ajuste, com a legenda **«a 1/6/2026»**. Não somar novamente saldo anterior antigo ou dias extra ao total inicial indicado.
3. Descontar apenas pedidos do tipo férias, aprovados ou pendentes, cujo início seja entre **1/6/2026 e 31/12/2026**. Um pedido iniciado antes de 1/6 não desconta, mesmo que termine depois. Pedidos anteriores permanecem visíveis; baixas e ausências não pagas não descontam.
4. Alinhar o saldo no Mapa de Férias, calendário anual, caixa de Aprovações e restantes vistas que mostram saldos ou férias contadas, sem alterar a visualização do histórico.
5. Em 2027, usar como saldo anterior o saldo de 31/12/2026 calculado pelo portal, incluindo valores negativos. Derivar esse valor dos ajustes e pedidos atuais, para não ficar desatualizado se houver uma correção autorizada. Somar o direito anual de 2027 e os dias extra aplicáveis e descontar os pedidos de 2027 pela regra atual.
6. Pessoas sem saldo inicial configurado mantêm o comportamento atual, incluindo Adalberto, Rita Saragoça e Ricardo Cabrita.

## Proteções e verificação

- Não alterar pedidos, estados, comprovativos, aprovações, timesheets ou banco de horas.
- Não aplicar nenhuma alteração antes da aprovação desta comparação, incluindo os dois saldos negativos.
- Testar os nove totais concretos, início antes/em/depois de 1/6, férias aprovadas/pendentes, exclusão de baixas e ausências, passagem para 2027, correção do ajuste e preservação das três pessoas excluídas.
- Verificar as vistas e permissões com dados fictícios; remover todos os dados de teste.

## Detalhes técnicos

- Alteração aditiva: tabela de saldos iniciais com unicidade colaborador/ano, data de referência e ajuste decimal, acesso protegido pelas permissões HR existentes, auditoria de alteração, GRANTs explícitos, RLS e revogação de TRUNCATE dos papéis de cliente.
- Migração aplicada pela ferramenta da base de dados e espelhada byte a byte em `supabase/migrations`.
- Reutilizar uma regra comum de cálculo nos vários consumidores. Não modificar os RPCs nem os triggers de aprovação/sincronização existentes.
- Traduções EN/PT-PT no mesmo conjunto de alterações.

**Estado: apenas consulta e plano; saldos e pedidos não foram alterados.**