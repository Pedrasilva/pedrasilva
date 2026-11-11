# Project Billing — implementação parcial e validação

11/11/2026. Plano aprovado; D38 registada. B1 revisão 10 OFF. Nenhum plano real preenchido, nenhuma permissão pessoal alterada, nenhum projeto/proposta real usado em testes de escrita. Políticas de ficheiros intactas.

## Entregue
- Faturação mostra pagamentos operacionais antes de haver documentos; base, IVA, total, gatilho, fase numerada, datas vivas e fornecedor.
- Descrições guardadas por ação auditada, revisão e proteção fiscal. Editor existente de datas auditadas disponível.
- Junção manual de dois ou mais marcos, descrição/data do grupo, desfazer sem perder valores recalculados; grupos manuais separados do agrupamento automático.
- Confirmação pré-emissão do gestor mantida e invalidada por alterações relevantes.
- Registo manual sem PDF cria documento fiscal existente e liga marcos; fiscalidade protegida. InvoiceXpress não construído.
- Fila Finance usa a mesma projeção e agrupamento, preservando avisos/auditoria de movimentos de datas.

## Verificado
- 6 testes puros: junção 5000+5000, IVA por linha, data mais tardia, próximos 14 dias não são prontidão, conclusão de fase, grupo parcialmente pago não é Paga.
- UI autenticada: plano Uralchem de duas linhas, sem documentos, verificado apenas em leitura; fila Finance abre.
- Cópia sintética: junção UI/releitura; Gantt 10000→12000 resulta 6000+6000; grupo mantém-se; confirmação e desfazer; descrição guardada/recarregada.
- Emissão de uma linha sintética sem PDF: documento único de 6000, vínculo ao marco, bloqueio de descrição e junção da linha emitida; fila contém linhas da cópia.
- Erro na ordem de registo/freeze reproduzido e corrigido; mesmo teste de emissão passou.
- Build OK e checker i18n zero; sete migrações idênticas nas duas pastas.

## Limites — não declarar publicação completa
- Ainda não concluídos: emissão de grupo inteiro/concorrência, PDF ligado a grupo, conciliação bancária parcial/integral, testes de leitor sem permissões e conversão/avenças/calendário end-to-end no novo ecrã.
- Datas das saídas usam o resolver operacional existente; casos mensais sem evidência/ordinal mostram dados por confirmar. Não inventar ligações ou datas.
- Nenhuma regra 50/50 imposta a fases reais sem plano; criação de regras/linhas novas e revisão de planos antigos não executadas.
- Restringir direitos fiscais a Luis/Tatiana ainda depende da lista de perdas e confirmação por pessoa.
- Preparação InvoiceXpress reutiliza campos externos existentes; evidência futura de envio/idempotência adicional não construída.

## Limpeza
Projeto sintético e pagamentos/grupos/fases/documento fiscal removidos; leituras independentes a zero. **Uma linha órfã de histórico comercial sintético permanece**, protegida pelo bloqueio imutável. Não desativei nem enfraqueci a proteção para a apagar. O histórico QA precisa de mecanismo de limpeza específico revisto, sem tocar em história real. Não declarar limpeza total.

## Segurança
Análise aprofundada anterior: dois achados críticos de emissão/envio de faturas, três críticos de armazenamento e seis avisos. Nenhum corrigido nesta tarefa; publicação global não certificada.
