# D53 — preparação autorizada e limites

## Entregue
- Seis tabelas aditivas: identidade de trabalho, reserva global de números/aliases, versões, contador anual, ativação independente e auditoria imutável. Colunas de ligação nullable nas três áreas; unicidade da revisão por versão. Nenhuma linha real foi preenchida.
- Atribuição automática preparada em triggers comuns de criação (leads, quotes, projetos diretos/conversão); bloqueios transacionais do contador/família, três dígitos, sem reutilizar aliases. Enquanto a ativação está OFF, criações normais continuam no fluxo anterior, sem renumeração silenciosa.
- Leituras protegidas, mudança manual de número exclusiva de admin, retoma por acesso de edição existente e registos de histórico. Guardas rejeitam mudança direta de referências/identidade.
- Controlos nos detalhes de lead/quote/projeto; retoma mantém pasta e cria versão sem alterar automaticamente planeamento/contrato/estado. A versão não é associada silenciosamente à linha original; a continuação do trabalho nessa versão precisa do fluxo aprovado de associação.
- Referências de quotes mapeadas usam letras no snapshot vivo para carta/capa/conteúdo; snapshots congelados e quotes não mapeadas conservam a apresentação histórica.

## Verificado
- 8 testes puros: YYNNN, limite999, primeira sem letra, A/B/Z/AA, legado0410B, retoma22014-26A/segunda-02 e Greg2530-26.
- 7 verificações autenticadas: cópia de Oleiro com ID próprio e sem ligação real, duas revisões ligadas só à cópia, duas retomas, alias antigo retido, mudança direta bloqueada e alfabeto. Tudo dentro de subtransação revertida, hash de todas as quotes antes/depois idêntico. Não alterou fases/valores/horas do original.
- Estado independente após testes: identidades0, versões0, quotes mapeadas0, ativação0, contador original129 e B1=false. Nenhuma fixture persistida.
- Traduções EN/PT em paridade, zero novas cadeias UI e build OK. Controlos vistos na quote original em modo não mapeado, número26117 preservado.
- Novas tabelas GRANT/RLS e REVOKE TRUNCATE; consulta global encontrou zero grants TRUNCATE para anon/authenticated. Defaults postgres mantêm esses papéis sem TRUNCATE; não alterados os defaults geridos.

## Não certificado / bloqueios
- **NÃO aplicado:** mapa real, religações Oleiro/DLMC, renumeração, reserva de pastas externas, ativação, limpeza de testes antigos.
- Colisões2602/2603/2604/2600, aliases2616/2608/2609 e relação Mint2678/2680 precisam da decisão de Luis no mapa. Aliases globalmente únicos não podem pertencer simultaneamente a trabalhos diferentes.
- Fluxo completo mapeado na interface (editar número, associar retoma a nova proposta, revisão/capa/letter, projeto convertido), concorrência de duas sessões, negação em conta não-admin e nova lead automática após ativação ainda não certificados. Testes acima não substituem esses ensaios.
- Aplicação atómica do mapa/hash e a ativação só serão construídas/acionadas para o mapa final aceite, sem qualquer abertura automática do gate. Pesquisa/listas/exportações futuras ainda precisam de integração completa da identidade canónica após o mapeamento; detalhes e snapshot vivo estão preparados.

## Ficheiros
- Migrações0313–0315 idênticas em drizzle/migrations e supabase/migrations; tipos gerados.
- src/lib/crm/work-numbering.ts; src/components/crm/work-identity-control.tsx; detalhes de leads, quotes e projetos; src/lib/psa-proposal/live-data.ts.
- EN/PT crm.json; scripts/test-work-numbering.test.ts; scripts/work-numbering-vitest.config.mjs; scripts/proposal-test-fixture.py (remove identidade original da cópia); src/lib/crm/AGENTS.md.
- DECISIONS/roadmap, inventários e mapa final Markdown/CSV. Regra técnica registada no módulo; limite de tamanho impediu edição de AGENTS raiz, sem reescrever regras do utilizador.

**Parar antes da aplicação real e aguardar aprovação do mapa. B1 OFF.**