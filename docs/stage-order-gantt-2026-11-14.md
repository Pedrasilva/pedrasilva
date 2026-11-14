# Ordem das fases — referência Gantt

## Regra confirmada por Luis
Todas as listas seguem a ordem inserida no Gantt (`parent_stage_id` + `sort_order`). Não foi criada uma segunda sequência nem aplicada cronologia por nome. A exceção anterior de apresentar avenças sempre no fim fica substituída. Nenhuma escrita de dados ou alteração de valores/percentagens.

## Causas
1. Organização/Fases renderizava filhos com descendentes **antes** dos filhos diretos. Construção aparecia antes de Programa, independentemente do Gantt. Cada `<ol>` começava de novo em1.
2. A tabela Architecture — Contract Total achatava Construção e comparava `sort_order` dos seus filhos com `sort_order` dos irmãos do grupo. Concurso local1 entrava entre Programa e Estudo Prévio. Agora compara posições na árvore completa.
3. O comparador comum e alguns seletores continham a antiga exceção construção/avença-no-fim. Removida por indicação de Luis; classificação continua disponível apenas para decidir o conteúdo de Gantts Projeto/Obra, não para ordenar.
4. BOTH/STAGE LIST era identificação do editor. Mantida no editor e removida explicitamente da árvore das Páginas/PDF.

## Auditoria antes → depois
| Local | Antes | Depois / validação |
|---|---|---|
| Calculador de honorários | Ordem do JSON de linhas | Linhas ligadas por calculator_row_id seguem Gantt; edição continua a usar índice original; linhas ainda não ligadas conservam ordem |
| Architecture/Contract Total e percentagens | Filhos achatados comparados por posição local | Posição na árvore WBS completa; montantes e cálculo inalterados; correção coberta por teste puro, tabela não exercida visualmente nesta verificação |
| Resumo financeiro/honorários | Comparador forçava avenças para fim | Comparador de irmãos segue ordem manual; documentos comparam posições da árvore completa |
| Tabelas de pagamentos e reconciliação | Exceção construção-no-fim | Ordem da fase no Gantt; prestações estáveis e linhas não ligadas preservam posição |
| Marcadores/diamantes | Coordenada da data e agrupamento | Coordenada da data preservada: nunca deslocar marco para fabricar sequência; fontes de pagamentos partilham ordem de fases |
| Gantt de proposta/projeto | Árvore com comparador especial | Árvore manual, sem exceção por tipo; numeração WBS preservada |
| Organização/Fases | Ramos antes de folhas, listas reiniciadas | Lista contínua de fases finais, sem cabeçalhos de grupo; Chiado/Oleiro7 itens, Alqueva8 |
| Programa/cronograma/AnexoB | Modelo WBS; folhas grandes separadas por categoria | WBS manual; folhas grandes divididas em blocos sem reagrupamento; overrides ordenados por fase |
| Deslocações por fase | Construção no fim | Ordem WBS numérica |
| Carta | Prosa guardada; resumo gerado a partir da leitura comum | Prosa não reescrita; dados futuros seguem leitura comum; não foi gerada carta por IA |
| Conversão e tarefas | Copia sort_order e ligações de origem | Lógica de conversão preservada; vistas usam WBS comum; conversão real não executada |
| Projetos, baseline e comparação | Leitura/seletores com comparador especial | Comparador partilhado corrigido; histórico guardado intacto |
| Faturação | Urgência por data, desempate construção-no-fim | Urgência por data preservada; desempate no mesmo projeto/data por WBS |
| Dashboards/relatórios | Agregações por projeto/data/tipo; leitores de projeto comuns | Sem reordenar ranking ou períodos; vistas de fases herdam leitura/comparador comum; não foi certificada cada página de relatório |

## Leitura autenticada
Chiado: Programa → Estudo Prévio → Submissão do PIP → Licenciamento -anteprojecto → Projecto de Execução → Concurso de obra → Assistência Técnica.

Oleiro: Programa → Estudo prévio → Submissão do PIP → Licenciamento → Projecto de Execução → Concurso de construção (apoio) → Avença fase de obra.

Alqueva: Programme Definition → Concept Design → Planning & Licensing → Technical Design – Tender Package → Technical Design – Construction Package → Tender Assistance → Construction Phase Services → Handover & Project Close-out.

Rótulos existentes preservados literalmente, incluindo os editados por Luis. Páginas:36/37/32, listas iguais à fonte, identificação do editor ausente; capturas examinadas para Chiado.31 testes e auditoria i18n passaram; compilação OK.

## Limite PDF
Download foi tentado nas três propostas: janela ficou vazia enquanto o estado da paginação permanecia loading, apesar de existir um conjunto visível de folhas. Não foi produzido nem certificado um novo PDF. Este bloqueio coincide com a limitação de exportação registada emD63 e não foi contornado aceitando folhas possivelmente desatualizadas. A correção da ordem partilha o renderer do PDF, mas isso não substitui validação do ficheiro exportado.

Pedidos de escrita automática observados no navegador foram bloqueados; não houve escrita permitida. B1 não alterado/OFF. Sem novas migrações, revisão, renumeração, alteração de planeamento ou prosa guardada.