# D53 — ronda 3: validação do mapa e limpeza autorizada

12 novembro 2026. Sem aplicação da numeração a registos reais. B1 OFF revisão10; zero identidades atribuídas. Ativação da numeração permanece OFF.

## Mapa v4

126 registos:30 leads,41 quotes,21 projetos,34 documentos. As rondas1–3 substituem o mapa anterior sem o apagar. Sequência integralmente igual à pedida por Luis:26019 Aethos,26020 Cascais,26021 Renovação,26022 Lagoa,26023 Cavid,26024 Reprodução,26025 Pediatria,26026 Santos/Estrela,26027 Setúbal,26028 South Perth,26029 Oleiro,26030 Chiado; próximo26031.

Única questão de identidade por decidir: Mint2678/2680 alternativas ou revisões, sob2603. Dez documentos órfãos de teste recebem referências propostas QA-017–026, sem aliases; não alterados na base. Miraflores/Mirear e SOUTH são uniões apenas no mapa. Lead hoteleira31949f67-93ea-4dea-a924-bbf6f539e416 já ausente, não eliminada por esta operação.

## Eliminação expressamente autorizada

Moradia XXL571a89f0-767b-4ea2-8b1b-98fe91f7f141 confirmado sem quote nem ponteiro principal;23 blocos e7 snapshots dependentes. Eliminado pelo ID/título exatos, usando a ferramenta de alteração de dados. As chaves existentes eliminam em cascata os dependentes deste único documento; nenhuma quote/projeto eliminado. Consulta posterior confirmou zero documento/blocos/snapshots desse ID,10 documentos QA órfãos preservados e41 quotes/21 projetos.

SQL executado exatamente:

```sql
DELETE FROM public.psa_proposals WHERE id = '571a89f0-767b-4ea2-8b1b-98fe91f7f141' AND title = 'Moradia XXL' AND quote_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.fee_proposals WHERE main_proposal_id = '571a89f0-767b-4ea2-8b1b-98fe91f7f141') RETURNING id, title;
```

Os diretórios de migrações recusaram a gravação do registo desta operação de dados; a ferramenta de migrações só aceita alterações de esquema. Não foi contornada a proteção; o SQL exato é preservado aqui e D53 regista essa limitação.

## Verificações

- Cada linha contém ID, nome, data de criação no Hub, estado, número atual, referência proposta, pasta original e aliases; nomes e PDFs históricos não são reescritos.
- Sequência conferida por IDs concretos;12 identidades novas, próximo26031.
- Aethos alias2601; Ericeira/Ruben2614 alias2663; South Perth26028 aliases2208/2675.
- Alqueva sem alias2616; Costa Vicentina sem alias2604; Quelhas sem alias2600; QA sem aliases.
- Ambas as leads Miraflores são2613; ambas as leads Oleiro são26029. Mantidas no mapa e na base.
- Mint é2603 em todos os registos/documentos, sem decidir letras ou relações das quotes.
- Nenhum código/app/permissão foi alterado nesta ronda. Validação do ciclo operacional e concorrência continua limitada conforme o relatório anterior, não certificada por esta revisão do mapa.

Ficheiros: mapas Markdown/CSV v4, este relatório, D53 em DECISIONS.md, roadmap e memória das regras confirmadas. Mapas v1–v3 preservados.