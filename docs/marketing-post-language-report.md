# Marketing post language

## Implementado
- Idioma por projeto e substituições independentes Instagram/LinkedIn: EN, PT-PT ou bilingue (PT primeiro).
- Predefinição existente EN; apenas 2025 Clínica Mulher mudou para PT-PT.
- Gerar ideias: Por projeto ou idioma forçado; Criar post usa o projeto da captura.
- Planner/composer resolvem o idioma das legendas, hashtags e frames; modelo Claude existente e limites preservados.
- Tradução manual via `translatePost` carrega uma versão no editor; Guardar/Aprovar grava final_copy/final_hashtags e idioma, sem alterar ai_copy. Stories traduzem texto, linha e texto do sticker sem mudar ordem/consentimento.
- Chips EN/PT/PT+EN no Planner e Calendário; nenhuma reescrita automática de posts existentes.

## Migrações
- `drizzle/migrations/0180_marketing_post_language.sql`
- Cópia idêntica: `supabase/migrations/20261024222800_marketing_post_language.sql`
- Campos nos perfis, pedidos, drafts e alternativas; guardas curator-only e locks de publicação existentes preservados. Tipos regenerados automaticamente.

## Ficheiros
- `src/lib/marketing/post-language.ts` (novo)
- `src/lib/marketing/translate-post.functions.ts` (novo)
- `src/lib/marketing/posts.functions.ts`
- `src/lib/marketing/posts.server.ts`
- `src/lib/marketing/compositions.server.ts`
- `src/lib/marketing/projects.ts`
- `src/lib/marketing/AGENTS.md`
- `src/routes/_app.marketing.projects.$profileId.tsx`
- `src/routes/_app.marketing.posts.tsx`
- `src/routes/_app.marketing.calendar.tsx`
- `src/i18n/locales/en/marketing.json`
- `src/i18n/locales/pt-PT/marketing.json`
- `scripts/test-post-language.test.ts` (novo)
- `roadmap.md`

## Verificação
- 19 testes de idioma/Stories/fila passaram; paridade EN/PT e compilação OK.
- Perfil Clínica Mulher mostra PT-PT com overrides Por projeto.
- Fixture explicitamente marcada: tradução devolveu «Uma sala tranquila, moldada pela luz natural.» e hashtag «arquitetura»; Guardar gravou PT-PT, mantendo ai_copy.
- Fixtures removidas; hash de todas as linhas reais antes/depois: `ef5547442775221ba242904e453a2efe`, idêntico.
- Canvas renderizou visualmente á, ã, ç, é, õ em JPEG de Story.
- Capturas de ecrã verificadas: `/tmp/browser/post-language/profile.png`, `planner.png`, `accents.png`.
- Finanças não alteradas. Geração completa de ideias/composer não executada neste teste; resolução e instruções verificadas por testes, tradução AI verificada pelo botão real numa fixture.