# Topo compacto do construtor de propostas

## Alterações
- Cabeçalho de 56 px: oportunidade, referência existente, título com lápis, cliente, percurso compacto, estado com menu e ações comerciais existentes.
- Barra de 48 px: revisão/histórico, atualização explícita da estimativa, modos/zoom, página-mestra, exportação e restantes ações.
- Ocultado o separador isolado Proposta e removidos controlos duplicados no construtor integrado. Canvas com deslocação independente sob ambas as linhas.
- Página-mestra e exportações passam primeiro para o menu em larguras reduzidas. Traduções EN/PT-PT adicionadas sem modificar textos documentais.
- Atualização relê os dados vivos já usados pelo documento e os blocos: não regenera pagamentos, não altera Gantt e não guarda a proposta. Indicador compara a projeção atual com a última atualização nesta sessão do navegador; não existe um marco persistido entre navegadores.

## Verificação
Leitura autenticada do Hotel Chiado com gravações bloqueadas: linhas 56/48 px, uma ação de envio, modos Split/Pages, histórico e menu reduzido com página-mestra/PDF/Word; sem excesso horizontal a 1000 px e sem erros JavaScript. Onze testes existentes de títulos e prontidão da paginação passaram; auditoria de tradução sem novas ocorrências e compilação válida.
Não foram executados envios, gravações de título, master ou revisões em propostas reais. Os mecanismos e restrições existentes foram preservados. Nenhuma alteração de dados/B1; B1 OFF.
