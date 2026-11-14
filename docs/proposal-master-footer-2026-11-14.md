# Rodapé móvel na página-mestre — 14/11/2026

**Causa:** só o logo e os contactos tinham arrasto; o rodapé não guardava posições e as Páginas/PDF impunham coordenadas fixas (14mm laterais, 6mm do fundo).

**Alterado:** geometria partilhada, controlos de seleção/arrasto/teclado/redimensionamento, opções Capa/Carta, margem inferior automática, posições em Páginas e PDF (incluindo folhas horizontais), traduções EN/PT e testes.

**Verificação Chiado (cópia de memória, sem escrita real):**
| Estado | Páginas | PDF | Rodapé Y | Margem inferior |
|---|---:|---:|---:|---:|
| Original | 36 | 36 | 265mm | 32mm |
| Rodapé deslocado | 40 | 40 | 240mm | 60mm |
| Reposto | 36 | 36 | 265mm | 32mm |

Sem erros de página. 13 testes e auditoria i18n aprovados. Limites: persistência em quote copiada não executada; botão PDF nativo continua não certificado.
