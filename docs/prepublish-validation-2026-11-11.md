# Pré-publicação — 11/11/2026

## Resultado
**Não publicar ainda.** O bloqueio das dependências foi encerrado. O PDF tem o mesmo conteúdo e paginação, mas ainda perde o cabeçalho das páginas de Conteúdo na impressão. A segurança aguarda aprovação das regras propostas abaixo; nenhuma política foi alterada e não foi usado «Try to fix».

## Gantt: PASS
Nos painéis reais de Projetos e CRM, em duas cópias descartáveis: criar FS/SS/FF/SF com lag +2; recarregar; editar cada ligação para o tipo seguinte e lag −3; recarregar; remover; recarregar e confirmar ausência. Os oito ciclos passaram, com leitura independente do plano guardado. A falha anterior era do seletor do teste: abrangia uma secção exterior e os controlos de sucessoras, não apenas o formulário de predecessoras. Não foi necessário alterar o Gantt.

[Projetos](prepublish-2026-11-11/project-FS-edited.png) · [CRM](prepublish-2026-11-11/quote-FS-edited.png) · [Resultados](prepublish-2026-11-11/dependencies.log)

## Capa / Carta / Conteúdo: NÃO PASSA a paridade visual completa
A cópia Hotel Chiado produziu 12 folhas no ecrã e 12 páginas A4 no PDF, através de Download → PDF da aplicação, não de uma serialização alternativa. Os textos de cada folha e cada página exportada são iguais. Capa e Carta não contam; Conteúdo começa em 1 e termina em 10/10. As 21 referências do índice correspondem às páginas das respetivas âncoras.

Falha reproduzida: «cover» e «letter» apareciam no rodapé impresso. Corrigida a criação do rodapé em `paginated-preview.tsx`: só as páginas com número de Conteúdo recebem o contador. Nova impressão confirmou ausência dessas etiquetas e manteve os 12 textos iguais.

**Falha remanescente:** cabeçalho/logo/contacto das páginas de Conteúdo aparece no ecrã, mas não é pintado no PDF. Verificação página a página encontrou a diferença; não basta comparar o texto do DOM. Uma experiência isolada de limites/pintura no documento de teste não resolveu e não foi aplicada à aplicação. [Comparação da última página](prepublish-2026-11-11/close-12.png). Não certifico paridade visual nem a causa definitiva desta segunda falha.

Não foi carregada uma assinatura inventada; a assinatura real continua dependente do carregamento administrativo. Outros controlos pendentes no [relatório anterior](proposal-cover-letter-report.md), como criação pela interface, overrides e carta longa/EN, não foram certificados nesta tarefa.

## Segurança — diagnóstico apenas
Todos os buckets verificados são **privados**. As três políticas sinalizadas são **SELECT**, não INSERT/UPDATE/DELETE. A descrição genérica do scanner não prova que estas três regras permitam alterar ou apagar ficheiros. Contudo, leitura demasiado ampla de ficheiros privados é um risco real e deve ser corrigida pelo âmbito certo, não por uma regra «só quem carregou» aplicada indiscriminadamente.

| Bucket / política | Quem abrange hoje | Ficheiros e sensibilidade | Escrita atual |
|---|---|---|---|
| `proposal-images` / `proposal_images_read_authenticated` | Qualquer conta autenticada; apenas bucket no filtro | 21 JPEG, biblioteca partilhada de imagens para propostas e página inicial; fotos de projetos/equipa podem ter confidencialidade ou direitos de imagem. Não é o arquivo de PDFs de propostas nem o local da assinatura. | INSERT: proprietário; UPDATE/DELETE: proprietário ou admin. A tabela da biblioteca tem também uma política ALL para PSA staff, que pode ampliar a edição dos metadados; não foi alterada. |
| `marketing-assets` / `marketing_assets_obj_select` | Conta autenticada que consegue ver uma captura com ID igual à primeira pasta | 212 ficheiros: JPEG/WebP, PDF e MP4; 27 em `library`, restantes fora dessa pasta; originais, material não publicado, projetos/clientes, vídeos e press kits. Potencialmente sensíveis mesmo sem salários/finanças. 122 sem owner_id, compatível com entradas de serviço. | Captura: INSERT autor ou curador com vínculo à captura e extensão permitida; DELETE curador. Biblioteca e ações têm políticas separadas por perfil/ação. Não há UPDATE de objetos nesta regra sinalizada. |
| `collaborator-photos` / `Authenticated read collaborator photos` | Qualquer conta autenticada | 8 PNG: retratos de colaboradores, dados pessoais; não documentos HR, salários ou justificativos médicos. | INSERT/UPDATE/DELETE admin. |

**Importante em Marketing:** a leitura faz EXISTS sobre `marketing_captures`, mas essa tabela tem uma política permissiva ALL `psa_staff_only` (`is_psa_staff()`). As políticas permissivas combinam por OR; por isso não se pode afirmar que o vínculo à captura já restringe a leitura apenas a Marketing. É necessário um predicado explícito de autorização Marketing (all ou autor+own), sem depender desse bypass. Não proponho alterar a política da tabela nesta tarefa; a regra de Storage pode aplicar esse predicado diretamente.

### Onde ficam os outros ficheiros / continuidade dos fluxos
- `financial-documents`: 1141 PDF, 821 sem proprietário; docs@ e Drive intake usam este bucket através dos caminhos de serviço existentes. Contém evidência financeira sensível. Não é um dos três alertas e não será alterado por esta correção.
- `benefit-receipts`: 24 PDF/JPEG, recibos e benefícios pessoais; leitura própria/admin e Finance existente. `leave-attachments`: 2 PDF/JPEG, justificativos de ausência, potencialmente sensíveis; leitura própria/aprovadores/admin. Não alterar.
- `proposal-pdfs`: 26 PDF, 6 sem proprietário, propostas/revisões comerciais; separado das imagens. Não alterar.
- `marketing-voice`: 10 WAV sem proprietário; separado de `marketing-assets`. Não alterar.
- Nova assinatura: `signatureData` é uma imagem data-URL nas definições `psa_letter_settings`, não um objeto destes buckets. Escrita admin e leitura PSA admin/CRM; pode ser copiada para o snapshot da proposta. Não modificar o carregamento nem criar uma falsa regra de proprietário que impeça outros autores de preparar cartas.
- Drive intake/export, despesas, publicação e remoção de vídeos continuam com as verificações e caminhos de serviço existentes. Não foram executadas ingestões/exportações reais para este diagnóstico.

### Regras mínimas propostas — aguardam OK de Luis
1. **Imagens de propostas:** leitura partilhada por PSA staff, não por toda a conta autenticada; manter owner/admin na escrita de objetos. Vincular as leituras à biblioteca e/ou referências autorizadas da proposta, com tratamento explícito de imagens antigas sem vínculo antes de apertar esse requisito. Não trocar por owner-only: quebraria propostas preparadas por outro autor e a biblioteca da página inicial.
2. **Marketing:** para `{capture_id}/...`, exigir captura existente **e** `marketing.view/all` ou autor da captura com `marketing.view/own`; preservar perfis históricos Marketing (não exigir projeto operacional). Manter políticas `library` e `actions`, publicação/claims e serviço de intake como hoje. Nada de owner-only: 122 originais sem owner e material editorial partilhado ficariam inacessíveis.
3. **Retratos:** leitura partilhada PSA staff, escrita admin como hoje; não owner-only, porque o administrador carrega retratos para a equipa inteira. Nota independente: `collaboratorPhotoUrl` ainda usa URL pública num bucket privado; eventual correção para leitura assinada é de apresentação, não motivo para tornar o bucket público.
4. Antes de aplicar: verificar vínculos de todos os ficheiros e contas de serviço sem ler/alterar conteúdo real; migração aditiva idêntica nos dois diretórios; testar uploads/leituras/negações em fixtures e preservar as políticas dos restantes buckets. Nenhuma autorização nova atribuída a pessoas.

## Tabela única de publicação
| Item | Seguro publicar? | O que bloqueia |
|---|---|---|
| Gantt — dependências nos painéis Projetos/CRM | **Sim** | Nenhum: oito ciclos com lag positivo/negativo e reload passaram. Demais evidências na [matriz anterior](gantt-release-validation-report.md). |
| Capa/Carta — sem numeração; Conteúdo 1–10; índice | **Sim, neste cenário testado** | Não substitui a paridade visual completa. |
| PDF — paridade página a página nos três tipos | **Não** | Cabeçalho de Conteúdo desaparece na impressão; controlos anteriores não certificados continuam listados. |
| Segurança — três políticas | **Não, até decisão e validação** | Aprovação das regras de âmbito PSA/Marketing e testes após aplicação. Nenhuma política alterada. |
| Publicação conjunta | **Não** | PDF e segurança acima. |

## Verificações e ficheiros alterados
- 10 testes Vitest passaram (`test-proposal-pagination-ready`, `test-gantt-dependency-cast`).
- Cópias eliminadas; query independente confirmou zero projetos, quotes e propostas com os títulos exatos das fixtures. Hotel Chiado original e blocos: igualdade antes/depois. B1 preview/recorded/effective false.
- `src/components/psa-composer/paginated-preview.tsx`: corrigido rodapé em Capa/Carta.
- `scripts/test-gantt-panel-dependencies-e2e.py`, `scripts/test-proposal-pdf-parity-e2e.py`: testes descartáveis, sem credenciais gravadas.
- Este relatório, `docs/prepublish-2026-11-11/`, `roadmap.md`.
- Sem migrações, alterações de políticas/permissões, dados reais ou decisões de produto. `docs/DECISIONS.md` não mudou.
