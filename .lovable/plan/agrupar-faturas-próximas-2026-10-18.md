# Agrupar faturas próximas

## Onde está hoje o plano de faturas
- **Proposta:** cada marco é uma linha própria do plano de pagamentos da proposta, com a sua data prevista, valor, condições de pagamento e estado («Planeada»).
- **Projeto:** na conversão, cada linha é copiada para o plano de pagamentos do projeto. A partir daí, o projeto deixa de depender da proposta.
- Cada linha já tem um campo «grupo de fatura», que hoje não é usado por nenhuma linha. A conversão já o copia e mantém os grupos.
- As faturas emitidas são guardadas noutro sítio, com linhas próprias. O agrupamento nunca lhes toca.

## Muda dados ou é só apresentação?
Muda poucos dados e nenhum valor:
- Cada marco continua a ser uma linha com o seu valor; nenhum valor é alterado nem dividido.
- O agrupamento só preenche o «grupo de fatura» das linhas que se juntam e põe em todas a data mais tardia do grupo. A data original de cada marco fica guardada, para o grupo se poder desfazer.
- A tabela Financial, o PDF e o cash flow mostram uma fatura por grupo, com os marcos como linhas e o total no fim.
- Os totais sem IVA, IVA e com IVA são somas das mesmas linhas, por isso não podem mudar.

## Regras
- Só juntam faturas «Planeadas» de saída, com as mesmas condições de pagamento e a mesma taxa de IVA. O «Pronto pagamento» nunca junta.
- O grupo começa na primeira fatura e só inclui as que caem até N dias depois dela. Uma fatura mais tarde abre um grupo novo, por isso os grupos não encadeiam.
- Cada proposta e projeto tem uma janela (predefinição 7 dias) e o interruptor «Agrupar faturas próximas».
  - Nas propostas novas vem ligado.
  - Nas existentes e nos projetos vivos vem desligado até o ligar.
- Quando uma fase muda de data, as faturas ainda planeadas reagrupam-se automaticamente, na base de dados, no mesmo momento.
- As linhas emitidas ou pagas nunca mudam e saem do grupo.

## Exemplo (2675): de 9 para 6 faturas, total 122 870 € s/IVA
17/10 (adiantamento) · 06/11 + 09/11 → 09/11 · 20/12 + 21/12 → 21/12 · 17/01 + 18/01 → 18/01 · 07/03 · 11/04.

## Projetos vivos com faturas já planeadas
- Hoje há 4 faturas planeadas em projetos e nenhuma está agrupada.
- O interruptor vem desligado nos projetos existentes. Ao ligá-lo, aparece primeiro uma pré-visualização (antes → depois, totais iguais) e só aplica depois de confirmar.
- O que já foi emitido ou pago nunca muda.
- Desligar o interruptor repõe as datas originais.

## Testes
- Testes da regra:
  - janela de 7 dias contada a partir da primeira fatura, sem encadear;
  - condições de pagamento diferentes não juntam;
  - o «Pronto pagamento» nunca junta;
  - faturas emitidas ficam como estão;
  - os totais ficam iguais.
- Verificação numa cópia da 2675 (9 → 6 faturas, 122 870 €), com mudança de data de fase e conversão em projeto. A cópia é apagada no fim.

## Estimativa
Cerca de 6 a 9 créditos.

## Detalhes técnicos
- Uma migração (com cópia idêntica):
  - colunas `invoice_grouping_enabled`/`invoice_grouping_days` na proposta e no projeto;
  - coluna `original_invoice_date` nas duas tabelas de plano;
  - uma função de reagrupamento chamada por gatilho nas mudanças de datas das fases e das linhas.
- A conversão continua a copiar `invoice_group_id` (já suportado).
- O PDF, a tabela Financial e o cash flow agrupam por `invoice_group_id`.
- A data agrupada também se aplica às datas de pagamento previstas (a data de fatura mais o prazo).
- Não há pacotes novos nem mudanças de permissões.
