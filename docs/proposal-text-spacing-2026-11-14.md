# Espaçamento do texto — 14 novembro 2026

## Entrega
- Grupo reutilizado no modelo e na tipografia da proposta, com 16 controlos, presets e reset.
- Entrelinha sem unidade (1,2–1,8, passo0,05); medidas de espaço em pontos. Intervalos normais0–18pt; avanços e espaço anterior dos títulos até36pt.
- Modelo vivo de espaçamento separado dos snapshots de fontes/geometria. Override explícito e reset ao modelo; nenhuma escrita automática nas propostas.
- Tokens CSS partilhados por canvas, iframe Páginas e exportação. Regras prioritárias de ritmo substituem margens antigas; índice preserva0/1,5/3em e leaders.
- Diálogo da proposta mostra um bloco existente em leitura, com espaçamento ao vivo; cancelamento invalida o preview em memória.

## Aplicação e validação
- Única escrita real: `psa_master_page_defaults.template.textSpacing`, guardada com guarda de revisão1, devolvendo revisão2. Todos os restantes campos preservados.
- Chiado `3d0db6b3-4bf5-4681-a875-c553f8c64656` e Oleiro `59a30496-130f-432e-9539-0b8a634c0c32` não tinham overrides de espaçamento: passam a herdar o padrão sem modificar as linhas guardadas.
- Sessão autenticada, Páginas completas: Chiado35/Oleiro36. PDFs físicos das folhas concluídas com os estilos CSS e regras reais de exportação:35/36páginas, texto impresso confirmado. Antes em D69:38/40; comparação histórica, não dois renders simultâneos.
- Corpo/lista19,6px (10,5pt×1,4), parágrafos8px (6pt), token entre itens3pt. Preview do diálogo após slider confirmado e cancelado nas duas propostas. Sem erros de execução.
-19 testes aprovados e auditoria i18n com0novos literais; compilação automática OK.

## Limites
- Download nativo PDF não recertificado; PDFs físicos foram capturados diretamente das folhas concluídas, preservando regras de exportação.
- Ciclo gravar/recarregar de override numa cópia persistente não exercido; resolver e herança cobertos por testes. Não foram criadas cópias nem alterados conteúdos, fees, planning, numeração, permissões ou B1.