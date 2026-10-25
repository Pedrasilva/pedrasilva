# Tradução — lote 7: erros do servidor e da base de dados

## Resultado
- **378 mensagens exatas + 30 padrões com interpolação = 408 mensagens mapeadas**, com chaves no novo namespace `errors`, em EN e pt-PT.
- Tradução apenas na apresentação. O texto original de erros, RPC, campos guardados e códigos permanece inalterado; mensagens desconhecidas e quase iguais ficam literalmente iguais.
- **Nenhuma migração, alteração de lógica do servidor, escrita de dados ou alteração às propostas financeiras pendentes.** Não foi necessário adicionar códigos no servidor; as mensagens já estáveis e os códigos existentes foram reutilizados.

## Inventário
- Auditados 408 `throw new Error(...)` em `src/**/*.ts` e 875 ocorrências de `RAISE EXCEPTION` nas migrações (449 textos SQL distintos).
- Mapeados os erros de validação, permissão, estado, publicação, captura, aprovação, horas, propostas, inventário e Finanças que podem chegar a notificações, diálogos ou cartões.
- Exemplos pedidos cobertos: aprovação inválida, frames de story que precisam de nova renderização, falhas de publicação Instagram, pedido sem posts/stories, `Item is already …` e `Use «Pedir aprovação» …`.

| Módulo | Exatas | Padrões | Total |
|---|---:|---:|---:|
| admin | 6 | 2 | 8 |
| common | 32 | 0 | 32 |
| crm | 9 | 3 | 12 |
| finance | 80 | 8 | 88 |
| hr | 17 | 3 | 20 |
| inbox | 12 | 0 | 12 |
| inventory | 2 | 0 | 2 |
| marketing | 153 | 10 | 163 |
| products | 1 | 0 | 1 |
| projects | 66 | 4 | 70 |

## Integração
- `translateError` / `translateErrorMessage`: correspondência exata ou padrão ancorado, interpolação (`status`, `detail`, `count`, IDs e datas), plurais e estados apresentados sem alterar o valor guardado.
- Um único wrapper de notificações substitui as importações diretas de `toast`, preservando ID, duração, ações e restantes opções; também traduz descrições textuais.
- Erros guardados mostrados nos cartões passam pelo tradutor: falhas de publicação Instagram, enriquecimento de capturas e histórico de ações de comentários. Também foram ligadas mensagens de erro em diálogos e cartões de cópias de segurança, extratos, Entrada, consentimento e HR.

## Testes
- `bun run test:i18n`: 13 testes do checker, **9 testes do tradutor**, paridade de 13 namespaces EN/PT e 0 candidatos UI.
- O teste verifica que cada mensagem mapeada tem tradução EN e PT, mensagens únicas, plurais completos, erro RPC imutável, erro guardado, padrões, detalhe aninhado, mensagens desconhecidas e notificação com opções preservadas.

## Verificação no browser
Uma notificação local recebeu o texto original `No valid approval for the current content` e mostrou em português: **“Não existe uma aprovação válida para o conteúdo atual.”** Um erro guardado de story foi também traduzido à apresentação. Todas as chamadas de dados do teste foram respondidas localmente; nenhuma chegou ao serviço real e não houve erros runtime.

![Notificação de erro em PT](i18n-batch7/error-toast-pt-PT.png)

[Captura completa](i18n-batch7/home-error-pt-PT.png) · [Evidência](i18n-batch7/results.json)

## Mantido intencionalmente como interno ou literal
- Configuração/segredos e ambiente (chaves, pastas, variáveis), falhas de rede/HTTP com corpo de fornecedor, respostas não legíveis da IA, ZIP/compressão e extração.
- Verificações de migração e invariantes: definições inesperadas, âncoras, rollback, fixtures, recuperação, checksums, imutabilidade técnica e validações JSON/UUID.
- Prefixos técnicos com mensagens arbitrárias (`drafts: …`, `update: …`, `upload …`) e mensagens do fornecedor (Meta, Drive, DocuSign, InvoiceXpress), que continuam exatamente como recebidas.
- Chaves já traduzidas pelos ecrãs (`gantt.schedule.*`, Finanças `provisional.*`, `meta.errors.*`) não foram duplicadas.

## Limites
O inventário de ocorrências inclui mensagens históricas e não comprova que todas estejam ativas. Os itens não mapeados incluem diagnósticos internos, chaves já traduzidas e variantes cuja exposição não foi confirmada; não são apresentados como cobertura integral de todas as exceções. O mapeamento é deliberadamente conservador: não traduz substrings arbitrárias. Fluxos que substituem um erro por uma mensagem genérica continuam a mostrar essa mensagem já traduzida.
