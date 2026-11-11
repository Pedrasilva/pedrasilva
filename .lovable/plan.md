# Permissões — investigação e consolidação proposta

**Investigação apenas. Aguarda OK de Luis; não é uma decisão registada.**

Relatório completo: [PSA — investigação de permissões](/mnt/documents/PSA-permissoes-investigacao-2026-11-11.md).

## Estado confirmado

- **B1 OFF**, confirmado pela aplicação e revisão 10 da auditoria. **Fase A ON**, revisão 27. São controlos diferentes.
- Matriz antiga e exceções v2 usam o mesmo armazenamento pessoal, mas verificações diferentes. Papéis v2 já estão ativos, mesmo com B1 OFF.
- **Access preview não decide acesso real.** O catálogo é um objetivo independente; ativar B1 não o ativa.
- 14 contas consultadas; nenhuma conta pendente entre colaboradores ativos sem login.
- Nenhuma alteração de código, políticas, papéis/permissões ou dados de negócio. Sem decisão de consolidação registada; D34 acrescentada apenas para a decisão separada de Tatiana.

## Que ecrã decide hoje

| Área | Autoridade atual |
|---|---|
| CRM | Misto: navegação antiga/v2; bloqueio interno e ciclo de vida das propostas ainda exigem antigas. |
| Projetos e planeamento | V2 operacional, alternativas antigas e acesso por projeto. |
| Gantt/financeiros de projeto | Fase A: quatro áreas por projeto e capacidade global auditada; edição financeira/Gantt não concede atos fiscais. |
| Timesheets | V2 para registar/ver/aprovar e cobertura de equipa; caixa antiga ainda na navegação. |
| HR | Páginas sobretudo antigas; dados/aprovações misturam antigas, v2, propriedade e aprovadores. |
| Finance | Entrada por administrador ou antiga finance.dashboard; dados também limitados por entidade. V2 Finance sozinho não abre o módulo. |
| Inbox | Antiga inbox.triage/admin, na página e no servidor. |
| Inventário | V2 leitura; gestão por administrador/gestor de Inventário separado. |
| Produtos | V2 leitura/edição na interface; uso em projetos distinto e política PSA ampla no catálogo. |
| Portfolio | V2 para entrada; leitores/exportações completos precisam de inventário antes da migração. |
| Marketing | V2 com autoria/own/all e curadoria; vários separadores exigem all. |
| Reports | V2 entrada + autorização dos leitores subjacentes. |
| Settings / contas | Administrador efetivo; HR não equivale a administrador global. |
| Access preview | Objetivos apenas, não autorização atual. |

## Conflitos concretos

1. **Caixas antigas ignoram granted=false/retired_at.** Existem projects.all retiradas para Bernardo, Francisco, João, Patricia e Ricardo Cabrita; projects.timesheet retiradas para esses cinco, Irene, Ricardo Conceição e Tatiana. V2 concede acesso próprio de timesheet e projetos por papéis diferentes; retirar uma chave antiga não revoga a nova.
2. **Conceder na matriz pode não reativar uma linha false existente:** INSERT com conflito ignorado. Remover apaga todos os âmbitos dessa chave.
3. **V2 não substituiu HR/CRM:** bases próprias HR não passam necessariamente páginas antigas; compensação v2 pode permitir dados enquanto a página exige uma concessão antiga. CRM v2 pode passar navegação mas falhar o bloqueio interno/ação de proposta.
4. **Tatiana:** o papel Finance tem finance.* v2, mas precisa atualmente da antiga finance.dashboard para entrada e vários serviços.
5. **Revogação é chave+âmbito exatos:** revogar own não remove all; eliminar exceção restaura o papel; v2 não elimina uma alternativa antiga.
6. **Benefícios:** helper antigo não verifica granted; v2 pode permitir leitura mas não a ação de aprovação. Férias, benefícios e remoto não são o mesmo direito.
7. **Descrição HR desatualizada:** a base real inclui compensação/edição de fichas/benefícios e financeiros de projetos, não apenas operação. Architect também tem edição de planeamento/fases global apesar da descrição de leitura.
8. **Achado de proteção de dados:** políticas permissivas PSA FOR ALL coexistem com restrições específicas em colaboradores, salários, Backoffice, saldos de benefícios, férias e objetivos user_access; privilégios de leitura/escrita confirmados. Combinam-se por OU. Portanto a autorização de leitura direta pode ser mais ampla do que qualquer ecrã sugere. Não foi feita escrita ou exploração noutra conta; triggers podem limitar ações específicas. Nenhuma política foi alterada.

## Contas e papéis

As 14 contas e respetivos papéis, incluindo sinais a rever, estão discriminadas no relatório completo; nenhuma atribuição alterada.

### Ricardo Conceição — alcance exato

- **Pode ver salários/compensação de toda a equipa**, não apenas custos horários de projetos: bruto/líquido, subsídios, ajudas, benefícios e snapshots. Tem base HR all e concessões antigas de valores individuais/resumo.
- Pode abrir lista/fichas e editar dados HR nos caminhos autorizados; certas configurações, saldos/importação e ações específicas continuam administrativas/auditadas.
- Pode aprovar/rejeitar benefícios e marcar pagos pela concessão antiga existente; pode aprovar trabalho remoto por hr.admin/all.
- **Não tem aprovação global de férias nem aprovação de timesheets nos efetivos.** Não é admin global, não gere contas/permissões e não tem entrada Finance/associação à entidade Finance PSA.
- Vê projetos/financeiros/margens, ocupação e timesheets de toda a equipa; CRM empresas/contactos, Marketing view/all, Products/Portfolio.
- Fichas/salários não autorizam automaticamente certificados privados de férias/baixa; ficheiros têm regras próprias, sem alterações.
- Retirar só HR deixa concessões antigas; retirar só antigas deixa o papel HR. Decidir por direitos concretos, não apagar um papel às cegas.

## Consolidação proposta

### 1. Retrato e aprovação dos direitos

Produzir pessoa × ação × âmbito × contexto × origem, incluindo papéis/negativas/retiradas, contas pendentes, admin, entidades, projetos, capacidades globais, aprovadores e gestores de Inventário. Luis confirma os sinais sensíveis e diferenças antes de alterar contas.

### 2. Uma página Permissions (v2)

Contas, papéis, exceções/revogações e efetivos com origem/contexto; integrar contas pendentes e gestão de administrador hoje na página antiga. Gestão global administrativa, com proteção do superadmin e autorremoção. Capacidades por projeto/equipa/entidade visíveis e separadas de HR. Definir revogação por âmbito versus remoção total da ação.

### 3. Migração por módulo, com comparação antes do corte

Mapa explícito antigas→v2. Preservar separação leitura/edição CRM; Finance fiscal/finanças de projeto; lista/ficha/compensação/resumo HR; benefícios/férias/remoto; uso/edição de Produtos. Criar direitos em falta para Inbox/configurações/resumo quando necessário. Atualizar interface, servidor e todas as políticas alternativas em conjunto. Não converter um direito antigo num grupo mais amplo por conveniência.

Políticas PSA amplas precisam de decisão própria e comparação de perdas/ganhos antes de qualquer alteração. SQL aprovado idêntico em supabase/migrations e drizzle/migrations, com restauração e auditorias preservadas. B1 fica OFF e não é ativado pela migração.

### 4. Ferramentas HR na área HR

Mover localização de gestão/criação de colaboradores, importação salarial, configuração HR, Subsídio de Alimentação, calendário/dias úteis/fechos e referências Backoffice conforme responsabilidades. **Preservar autorizações atuais**; dar acesso novo a não-admin é decisão separada. Gestão de contas/permissões fica em Permissions. Centros de custo internos pertencem a Projetos/planeamento; custos bloqueados e papéis comerciais são partilhados com Finance/CRM, sem duplicar os proprietários.

### 5. Validar e só depois retirar a matriz

Contas/objetos descartáveis: concessão/revogação/reposição, vários papéis/âmbitos, leitura e escrita diretas, próprios/equipa/todos, projetos/entidades, ficheiros, aprovações e provas fiscais. Comparação exata com direitos aprovados; dados reais/horas/snapshots intactos e limpeza confirmada. Retirar editor antigo e redirecionar só após paridade/OK; conservar história e tabela pessoal usada também por v2.

### 6. Integrar Access preview sem segunda autoridade

Permissions mostra Atual/Proposto. **B1 ON não ativa user_access.** Integração mínima: catálogo como apresentação sobre v2, sem fonte concorrente; torná-lo autoritativo exige cutover próprio aprovado. Preservar todos os âmbitos/contextos/direitos e rever sua política de escrita antes de qualquer poder real. Ativação auditada e rollback na primeira divergência; aprovação B1 separada.

## Riscos e limites

- Perdas/ganhos de acesso mascarados pela coexistência; salários e atos fiscais; revogações aparentes; ampliação ao mover HR; aprovações confundidas; acesso externo PSA; objetivos inativos tornados autoritativos sem proteção.
- Preservar docs@, Drive, despesas, Marketing e assinatura com mapeamento próprio de serviço/utilizador/ficheiro; não impor owner-only genérico.
- Investigação por leitura autenticada e metadados atuais, sem consultar valores salariais/documentos pessoais ou testar escritas. Não certifica todas as exportações/leitores nem publicação segura.
- As três regras de ficheiros anteriormente reportadas continuam pendentes e intactas. Nenhum achado será corrigido sem OK de Luis.

**Aguardar decisão; não registar em DECISIONS.md antes dela.**
