# Carta — página-mestre comum (D62)

- Geometria da Carta herda a página normal, mesmo quando existem overrides antigos; editor master mostra a geometria partilhada.
- Logo interno e rodapé próprio removidos; cabeçalho normal reutilizado, com morada em vez de email/site nas páginas da Carta.
- Corpo normalizado apenas na apresentação: quebras de linha tornam-se parágrafos, preservando inline bold/links e removendo vazios. Três testes de parsing e11 de regras da Carta aprovados;22 testes de geometria/títulos/prontidão também aprovados; auditoria i18n sem candidatos novos; compilação OK.
- Campos opcionais resolvidos sem escritas automáticas; edição explícita usa ação existente. Corpo usa RichTextEditor comum, com bloqueios existentes preservados.
- Chiado autenticado e read-only: Carta1 página, documento/PDF35. Logo x34,015625px/y30,234375px/largura180,4375px exatamente igual à página normal; coluna x94,484375px/largura646,296875px igual. Corpo14px/21px/gap10,5px; data gap28px. Zero erros JS.
- HTML descartável longo:3 páginas,3 cabeçalhos e parágrafo24 presente; sem escrita de dados. Gravação de campos não foi exercida na proposta real; não se certifica round-trip persistido nesta verificação.
- Alterados: letter-page.tsx, letter.css, letter-controls.tsx, block-settings-panel.tsx, master-page-editor.tsx, paginated-preview.tsx; letter-fields.ts, letter.ts, master-page.ts, document-rhythm.ts; styles.css, traduções EN/PT e testes. Valores/documentos guardados/B1 não alterados.