# Oleiro — documento principal persistente

## Resultado

Aplicada a aprovação de Luis de 12/11/2026 às 01:23 UTC, registada como D47. Oleiro `d73deb33-a0f9-41bb-ad4d-637cd5d159b6` tem agora `main_proposal_id = 84e54031-64db-41d8-aa30-b22d882a6017`. Não houve eliminação, recuperação editorial ou execução dos três antigos testes de paginação/PDF.

Composer, envio e versões usam uma consulta partilhada, com nova chave de cache, atualização ao montar/focar e a cada cinco segundos. Uma mudança de documento remonta o composer/versões e fecha a seleção antiga do envio. Revisões de quotes e captura de templates usam também o documento principal. As ações de aceitação só consideram snapshots enviados desse documento. Não há seleção por título ou `updated_at`.

A ligação tem uma chave estrangeira composta que impede apontar para um documento pertencente a outra quote. A migração inicializa automaticamente apenas quotes com um único documento existente, além da indicação explícita autorizada de Oleiro; quotes ambíguas sem indicação não escolhem uma proposta nem criam outra silenciosamente. O primeiro documento de uma quote nova reclama a ligação, sem substituir uma ligação existente. O identificador é excluído das comparações comerciais, para não invalidar snapshots antigos por acrescentar este campo de organização.

## Verificações

| Verificação | Resultado |
|---|---|
| Composer autenticado como Luis abre o original PT | PASS — leitura dos blocos pelo ID original; captura verificada |
| Nenhuma escrita do navegador na proposta real | PASS — uma tentativa automática de escrita foi preventivamente bloqueada pelo ensaio; nenhuma foi permitida |
| 34 blocos originais intactos | PASS — hash completo `156d2cc33c6702fb9460185e4600d7d1`, igual antes/depois |
| 22 snapshots preservados | PASS — hash completo `702c34080f998f92dcbaf5472b0f08cb`, igual antes/depois da verificação |
| B1 | OFF, revisão 10; nenhum comando de ativação |
| Seleção explícita, ausência/ambiguidade, sem fallback, atualização | 5 testes PASS |
| Regressões de lifecycle | 13 testes PASS |
| Guards de quote/documento/snapshot de teste | 4 testes offline PASS; guard adicional recusou a quote real no navegador |
| Sintaxe Python / migrações espelhadas / i18n | PASS; zero novas strings UI |
| Aplicação | build OK |

O navegador de Luis já aberto não está sob controlo deste ensaio. A aplicação atualizada passa a renovar a seleção; se a aba ainda tiver a versão antiga da aplicação carregada, deve recarregá-la. A validação do original foi estritamente de leitura com bloqueio de escritas, não um teste editorial numa quote real.

## Scripts corrigidos

Os três scripts passam por `proposal-test-fixture.py`: primeiro criam uma quote independente, copiam programa/tabelas associadas remapeando IDs e referências dos blocos, e só depois criam o documento. Removem ligações de cliente/projeto/aceitação da cópia e verificam B1 OFF. Antes de operações de alteração verificam ligação do documento e os IDs de quote dos snapshots; recusam referências à quote real. Não há limpeza automática por título nem eliminação automática final: a eventual fixture fica identificada para revisão.

**Limite:** a fábrica corrigida foi revista e verificada sintaticamente, mas não executada para criar dados nesta tarefa. Os antigos ensaios PDF/Gantt não foram executados; não foram criadas nem apagadas fixtures persistidas. O teste PDF mantém as suas verificações existentes, mas a fábrica comum não reproduz a antiga inserção especial de uma Carta adicional.

## SQL aplicado

As três migrações foram aplicadas e guardadas byte a byte em ambos os diretórios:

- `drizzle/migrations/0307_quote_main_proposal_document.sql` e `supabase/migrations/0307_quote_main_proposal_document.sql`: campo persistente, unicidade/chave composta, inicialização sem recência, Oleiro original, primeiro documento e seleção de lifecycle/hash/snapshot.
- `drizzle/migrations/0308_quote_revision_uses_main_document.sql` e `supabase/migrations/0308_quote_revision_uses_main_document.sql`: clone de revisão usa o documento principal, sem alterar o mecanismo de cópia nem permissões.
- `drizzle/migrations/0309_quote_template_uses_main_document.sql` e `supabase/migrations/0309_quote_template_uses_main_document.sql`: captura de template usa o mesmo documento.

Nenhuma política de storage foi alterada; nenhum conteúdo/snapshot foi regravado.

## Ficheiros alterados

- `src/lib/psa-proposal/use-main-proposal.ts` (novo)
- `src/lib/psa-proposal/use-psa-proposal.ts`
- `src/components/quotes/quote-proposal-composer-embed.tsx`
- `src/components/quotes/quote-workflow-actions.tsx`
- `src/components/quotes/quote-revisions-button.tsx`
- `src/integrations/supabase/types.ts` (regenerado automaticamente)
- `scripts/proposal-test-fixture.py` (novo)
- `scripts/test-proposal-fixture-guard.py` (novo)
- `scripts/test-main-proposal.test.ts` (novo)
- `scripts/test-proposal-explicit-breaks-e2e.py`
- `scripts/test-proposal-terms-gantt-e2e.py`
- `scripts/test-proposal-pdf-parity-e2e.py`
- Seis ficheiros SQL listados acima
- `docs/DECISIONS.md`, `AGENTS.md`, `roadmap.md` e este relatório

Captura de verificação: `/tmp/browser/main-proposal/selection.png` (proposta original, idioma Português (Portugal), passo Proposal builder). Não foi publicada a aplicação.