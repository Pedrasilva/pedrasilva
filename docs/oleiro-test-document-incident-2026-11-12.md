# Oleiro — investigação de documentos de teste

12/11/2026. Apenas consultas; nenhum dado, política ou código da aplicação alterado. B1 registado OFF, revisão 10. D46 é a única nova decisão. Não foram executados os scripts de teste nem aberto o editor real, evitando autosaves.

## Conclusão e responsabilidade

Os meus testes criaram documentos descartáveis **ligados à quote real**, porque copiaram a linha da proposta sem retirar/substituir `quote_id`. Isso foi um erro de isolamento. A página da quote escolhe o documento com `updated_at` mais recente, não um documento original fixo; logo uma cópia recém-editada pode substituir o original na seleção. O sincronizador de título pode ainda renomear essa cópia para o nome da quote, tornando-a indistinguível pelo título. A eliminação no fim não impede a exposição durante o teste, nem garante que uma página já aberta largue imediatamente o documento em memória.

As afirmações anteriores «cópia de Oleiro» não deixaram clara esta ligação perigosa. A verificação de blocos intactos não certificava o isolamento da quote.

## (a) Original e conteúdo preservado

- Quote: `d73deb33-a0f9-41bb-ad4d-637cd5d159b6`.
- Documento original existente: `84e54031-64db-41d8-aa30-b22d882a6017`.
- Criado: **11/11/2026 22:33:36.016590 UTC**; atualizado: **12/11/2026 00:05:19.392076 UTC**; idioma `pt-PT`, rascunho, 34 blocos.
- Todos os 34 IDs e conteúdos `content_rich` coincidem com os baselines guardados antes dos testes de quebras (00:44:06 UTC) e de Gantt/termos (00:50:06 UTC). Os timestamps dos blocos consultados também coincidem. Isto prova preservação nesse intervalo, não que o documento nunca tenha sido editado anteriormente.
- `d4282d4d-c976-4c7c-a9fc-830d810f9b68` existe no original, com **39 723 caracteres de HTML português** e **11.6 Identificação em obra.** Atualizado às 00:37:11.936248 UTC; não substituído por termos ingleses.
- O original atual contém `eProjecto de Arquitectura`, sem as maiúsculas pedidas. O bloco `cf14e2f3-7f6a-407c-957b-11e8a198d652` foi atualizado às **00:08:12.292274 UTC**. Não se pode afirmar que o original atual corresponde integralmente ao texto que Luis recorda.
- O histórico confirma que **PROJETO DE ARQUITETURA** existia: versões de 23:34:19 até 00:06:13 conservam a expressão; a versão das 00:11:43 já tem `eProjecto de Arquitectura`. Assim, a alteração é guardada, entre essas versões, anterior aos testes de paginação aqui examinados. Não há auditoria com autor/operação que permita atribuir esta alteração com segurança.
- Existem 22 snapshots automáticos. Não apagar: são histórico real, não identificados como fixtures. Nenhuma versão atual reúne simultaneamente o texto antigo em maiúsculas e os termos PT finais; restaurar o documento inteiro pode perder edições legítimas posteriores.

## (b) Inventário atual completo

Hoje existe **um único documento** ligado à quote: o original acima, com 34 blocos. Não há blocos `Boundary origin` / `Boundary destination`, nem bloco atual com prefixo `1d2fa8c2`. Há **22 versões automáticas**, todas do original; `rev_number` é NULL, não revisões enviadas numeradas.

Todos os tempos são UTC; datas omitidas na coluna de hora são 11/11 até 23:55 e 12/11 desde 00:01.

| Snapshot | Criado UTC | Blocos |
|---|---|---:|
| 3b439c64-2b2b-4610-bf0f-9045874a6f37 | 11/11 22:33:37.070427 | 19 |
| b6885393-7fb7-4da5-b37f-1b323d6f51fb | 11/11 23:09:10.585997 | 39 |
| 506a3cdf-86e4-4f71-88d0-dbee4af61d39 | 11/11 23:22:06.964481 | 39 |
| ac7b9f6e-541b-41c9-b758-a740c5b2e613 | 11/11 23:27:16.291570 | 39 |
| 23d4317c-4427-4a21-8578-b984b533d68c | 11/11 23:32:22.357204 | 39 |
| 8077b609-2595-4f5c-8f87-bc88d668bb9e | 11/11 23:34:19.989644 | 39 |
| 2a44c5ea-a51b-4ec8-996c-ccd59fca10b6 | 11/11 23:37:30.788675 | 39 |
| 7ced77ce-f174-4444-b47a-a3ef5277e8c9 | 11/11 23:42:40.628557 | 38 |
| 9244e491-d088-43ed-b9a8-538ff93f8f4f | 11/11 23:55:50.036082 | 34 |
| 1d8f2c12-f73f-472b-b917-83a7881de2b4 | 12/11 00:01:12.146776 | 34 |
| bb591a7a-dbc3-45d2-9951-f05a264d77ef | 12/11 00:06:13.179911 | 34 |
| e0e4c7b6-a63c-4961-99a1-ee704a86a579 | 12/11 00:11:43.357811 | 34 |
| 06534cdf-0653-4041-8ef4-0df6ad6cfe5c | 12/11 00:12:29.792747 | 34 |
| 6b146d4f-f256-4306-9279-5218b9e2b152 | 12/11 00:17:32.904440 | 34 |
| a1494653-c047-4d60-a19e-c3cdd2563485 | 12/11 00:19:29.136758 | 34 |
| 10090ade-f56f-4d3b-a74f-6c86da37429e | 12/11 00:22:35.267216 | 34 |
| 0aed617b-8d45-4c21-8c69-804776fc62eb | 12/11 00:24:20.886891 | 34 |
| d26fcf1d-a257-4250-a3fb-941705e39c79 | 12/11 00:28:27.990654 | 34 |
| 868ecc81-00f8-4c47-ab11-cfae61c95554 | 12/11 00:34:41.282935 | 34 |
| cbfa0194-85c3-43fc-bde5-54cfc3ca7727 | 12/11 00:36:58.999857 | 34 |
| d7a30606-0c4c-41c5-ac6c-f8f66acbd633 | 12/11 00:37:20.694520 | 34 |
| b7c6c6bc-774b-4981-a656-1709d8c6d39b | 12/11 00:40:09.324025 | 34 |

### Documentos de teste históricos identificáveis

| ID conhecido | Evidência de existência | Blocos | Estado atual |
|---|---|---:|---|
| a1ea702e-a191-435e-adea-4fe251091e4f | baseline capturado 12/11 00:44:06 UTC | 34 inicialmente | eliminado anteriormente; consulta atual sem linha |
| 61b18146-8990-46ea-83e6-ea3efb70f329 | baseline capturado 12/11 00:50:06 UTC | 34 inicialmente | eliminado anteriormente; consulta atual sem linha |
| outras execuções dos scripts de quebras e termos | scripts e logs de limpeza | quebras: 34 inicialmente, depois 2/3; termos: 34 | logs indicam remoção; nenhum documento extra ligado permanece |

Os ficheiros de evidência guardaram o ID da fixture, mas **não o seu created_at**; os momentos acima são capturas, não datas de criação inventadas. As execuções repetidas não guardaram todos os IDs. Não é possível produzir um inventário histórico exaustivo dos documentos já eliminados com os dados disponíveis. A consulta a snapshots cujo conteúdo aponta à quote mas cujo documento não é o original não devolveu linhas; a auditoria do original também está vazia. Não atribuo o prefixo `1d2fa8c2` a uma fixture específica sem prova.

### Escritas examinadas

Os scripts copiam o documento com `...copy`, retendo `quote_id`; copiam blocos com novos IDs e `proposal_id: np.id`. Apagam/substituem os blocos dessa fixture para os ensaios Boundary; esvaziam termos e alternam idioma dessa fixture para PT/EN. A limpeza apaga `f.id`, não o original. Não foi encontrada nessas rotinas uma escrita explícita nos blocos originais. A igualdade dos 34 conteúdos desde os baselines confirma isso para estes testes. Não há prova suficiente para atribuir todas as edições anteriores das 00:08 ou todos os snapshots automáticos a um autor.

## (c) Seleção errada

`src/components/quotes/quote-proposal-composer-embed.tsx` procura `quote_id` e ordena por `updated_at DESC LIMIT 1`. Ações de workflow e versões repetem esta escolha em `quote-workflow-actions.tsx` e `quote-revisions-button.tsx`.

`ProposalTitleSync` pode atualizar o título da proposta selecionada para «Travessa do Oleiro», reforçando a aparência de original. A seleção em memória não é uma prova de qual linha existe atualmente. Hoje uma consulta nova seleciona o original, por ser o único documento. O estado exato do navegador de Luis não foi reproduzido nesta investigação; não se alterou ou limpou a sua sessão.

## Proposta de correção — aguarda OK, não executada

1. Preservar o original `84e54031…` e os 22 snapshots. Não restaurar tudo nem apagar histórico automático.
2. Tornar explícito/persistente o documento principal da quote e usar a mesma seleção no composer, workflow e versões; inicializar Oleiro com o original apenas mediante autorização, sem depender de recência ou título. Atualizar/invalidate a seleção já aberta para não conservar a antiga fixture.
3. Corrigir os scripts de teste para criarem primeiro uma QUOTE separada e abortarem se algum documento/revisão de teste apontar a uma quote real. Não executar os scripts atuais.
4. Nenhuma cópia de teste permanece ligada neste momento, portanto **não há eliminação pendente identificada**. Se surgir outra, listar ID, created_at, blocos, ligações e dependências para autorização exata, preservar evidência e eliminar apenas esses IDs. Nunca apagar pelas palavras do título.
5. Se Luis quiser recuperar as maiúsculas, comparar o bloco da versão `bb591a7a…` (00:06:13) com o atual e propor uma correção editorial estreita no bloco de descrição, preservando o restante e os termos PT finais. Esta investigação não autoriza a alteração.

## Ficheiros alterados nesta investigação

- `docs/DECISIONS.md`: D46, sem reescrever decisões anteriores.
- `roadmap.md`: investigação e aprovação pendente.
- Este relatório; memória persistente: regra de teste com QUOTE separada.
- **Nenhuma alteração à aplicação, SQL, políticas, dados de Oleiro ou testes.**