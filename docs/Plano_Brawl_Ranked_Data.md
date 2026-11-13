# Plano do Brawl Ranked Data

**Base da revisão** · código de `main` no commit `af962ea`, consultado em 12/11/2026. O plano descreve as entregas e seus critérios de aceite. A ocupação do Supabase, a cota consumida no Fixie e o formato dos bans reais no nosso coletor ainda dependem de medição.

**Andamento em 13/11/2026** · A primeira entrega implementa as janelas por patch e temporada, a tier list por recorte, a referência histórica separada e o diagnóstico de coleta e armazenamento. A migração foi exercitada em PostgreSQL descartável. A primeira rodada com credencial e banco do ambiente de destino, a ocupação real do Supabase e a confirmação dos bans no battlelog ficam para a validação operacional. As datas do catálogo representam janelas conservadoras quando o horário exato do patch ou da temporada não está confirmado.

## 1. Ponto de partida

| Área | Existe no projeto | Próxima lacuna |
|---|---|---|
| Contas e histórico | Perfil, Elo quando enviado, snapshots, histórico por tag, registros de coleta e evidência manual | Alinhar comparação pessoal ao mesmo mapa e período da amostra competitiva |
| Coleta competitiva | Fila descoberta por rankings de troféus e participantes das partidas, corte de Elo, deduplicação de ranqueadas 3×3 e tratamento de `429` | Medir cobertura real, idade da fila, requisições e rendimento por rodada |
| Armazenamento | Partidas da conta com JSON original, participantes em tabela própria e amostra competitiva compacta, com times, mapa, horário, vencedor e Elo observado | Medir as tabelas e os índices. Incorporar dados de draft confirmados e agregar por versão |
| Banco | `DATABASE_URL`, Psycopg e PostgreSQL. O README já prevê Supabase e PostgreSQL local. Há SQL PostgreSQL na inicialização, em repositórios, serviços e rotas | Definir contratos por operação, versionar migrações e testar restauração |
| Análises competitivas | Janelas de hoje, sete dias e alto nível em sete dias. Cálculos de picks, vitórias, counters e sinergias. Há uma referência histórica e um importador de observações | Criar catálogo de temporadas e patches, trocar o recorte padrão e exibir a procedência |
| Interface | Meta, Picks, bans e counters, Draft Lab, Partidas e Progressão já são áreas próprias. O Draft Lab tem um seletor restrito à referência histórica | Ligar as três áreas competitivas ao mesmo seletor e evoluir fichas de brawler e mapa |
| Operação | Script do Agendador de Tarefas do Windows e configuração documentada para Cron no Render | Confirmar execução real, orçamento da conexão e quem coleta cada ambiente |

A amostra competitiva exclui as tags de contas cadastradas como ponto de partida para a coleta. O Elo nela registrado vem do perfil consultado e serve como indicador da origem da observação. A divisão de cada lobby exige evidência adicional.

[Conexão e inicialização](https://github.com/DiasMath/Brawl-ranked-data/blob/af962ea4f9baf83b1034ece1d5d187ae63d2217c/backend/app/db.py) · [Esquema de dados](https://github.com/DiasMath/Brawl-ranked-data/blob/af962ea4f9baf83b1034ece1d5d187ae63d2217c/backend/app/schema.sql) · [Amostra competitiva](https://github.com/DiasMath/Brawl-ranked-data/blob/af962ea4f9baf83b1034ece1d5d187ae63d2217c/backend/app/services/meta_sample.py) · [Fila competitiva](https://github.com/DiasMath/Brawl-ranked-data/blob/af962ea4f9baf83b1034ece1d5d187ae63d2217c/backend/app/services/meta_tracker.py) · [Agendamento](https://github.com/DiasMath/Brawl-ranked-data/blob/af962ea4f9baf83b1034ece1d5d187ae63d2217c/README.md#coleta-recorrente-da-meta)

## 2. Referências e o que reaproveitar

| Referência | Prática documentada | Aplicação no nosso painel |
|---|---|---|
| Brawlify | Histórico acumulado para perfis acompanhados e estatísticas agregadas | Acompanhamento de conta e calendário de atividade. A infraestrutura interna permanece sem confirmação |
| Brawl Draft | Coleta expande a fila pelos participantes, deduplica partidas e usa histórico com peso decrescente. O projeto aberto documenta JSONL e Parquet | Reaproveitar o desenho da coleta e do arquivo compactado. Estudar ponderação histórica como previsão opcional |
| Apollo Meta | Agrega resultados gerais e por mapa. Ajusta taxas para lidar com amostras pequenas | Aproveitar o intervalo de Wilson já implementado no frontend e publicar o volume junto da taxa |
| DraftMeta | Compara antes e depois do balanceamento por mapa e informa a origem dos bans observados | Comparar patches sob condições equivalentes e validar os novos campos no nosso battlelog antes de publicar ban rate |

Dados externos só entram como fonte identificada quando houver acesso reutilizável e compatibilidade de período, granularidade e denominador. As referências públicas também servem para conferir comportamento e comparar resultados.

[Brawlify](https://brawlify.com/about/privacy-policy) · [Brawl Draft — metodologia](https://brawldraft.com/how-it-works) · [Brawl Draft — código](https://github.com/mctatge/Brawlstars-Draft-Tool) · [Apollo Meta](https://www.brawlgg.com/methodology) · [DraftMeta — patches](https://draftmeta.com/games/brawl-stars/patches) · [DraftMeta — bans](https://draftmeta.com/games/brawl-stars/ranked/bans)

## 3. Ordem de implementação

| Etapa | Entrega | Como validar |
|---|---|---|
| 1. Patch, temporada e medição | Catálogo de temporadas e balanceamentos com horários, fonte e status. Relatório com patch atual, patch anterior e temporada. Tela indica amostra, última atualização e referência histórica. Diagnóstico inicial de uso do banco e da coleta | Uma partida anterior ao corte vai para a versão anterior. Uma no instante do corte entra na nova. Atualização sem horário confirmado fica pendente de classificação naquele intervalo. Dados históricos e duplicatas passam pelos mesmos critérios |
| 2. Persistência portátil | Contratos para partidas, versões, fila e leituras analíticas. Primeiro adaptador PostgreSQL, com migrações versionadas e ensaio de restauração no PostgreSQL local. Aplicar a fronteira gradualmente nos fluxos existentes | Mesmo conjunto de dados produz as mesmas contagens e respostas em banco vazio, atualizado e restaurado. Uma segunda coleta do mesmo lote preserva os totais |
| 3. Coleta contínua | Medir chamadas por endpoint e origem, cache de perfis, fila por prioridade, controle de cota e deduplicação. Começar no Windows com orçamento compatível. Usar Render ou outro executor sempre ligado conforme o volume e o IP de saída | Confirmar rodada real, consumo, partidas novas por chamada, pausa em `429`, tempo de fila e cobertura. Execuções simultâneas respeitam o mesmo controle de escrita e orçamento |
| 4. Produto analítico | Tier list por patch e mapa, altas e quedas. Central de picks, bans e counters. Fichas por brawler e mapa, comparação pessoal e sugestões explicadas no Draft Lab | Todos os painéis mostram origem, recorte e volume. As métricas batem com o mesmo lote de referência. A ficha preserva os filtros ao abrir o Draft Lab |
| 5. Escala e retenção | Agregados incrementais quando a leitura do histórico se tornar cara. Arquivo competitivo por temporada e patch, com Parquet e procedimento de restauração quando o volume justificar | Um patch arquivado pode ser reprocessado com os mesmos totais. Conferir contagens, intervalos, identificadores e métricas antes de remover dados da camada de consulta frequente |

A primeira entrega funcional reúne o recorte por patch e a medição. As migrações e os contratos começam pelas operações que esse recorte toca, para aproveitar o código que já existe.

## 4. Regras dos dados e das métricas

- **Tempo.** Classificar pelo horário em que a partida aconteceu, salvo em UTC, com horário local no painel. Cada recorte começa no instante inicial e termina imediatamente antes do corte seguinte. A temporada pode agrupar vários patches. Seu consolidado deve explicitar as versões que inclui. Diferenciar a publicação da nota do horário efetivo em que o patch entrou no ar. As [notas de novembro da Supercell](https://supercell.com/brawlstars/en/blog/game-updates/release-notes-november-2026/) registram a manutenção de 11/11/2026. O horário efetivo e eventuais hotfixes adicionais precisam de evidência própria.
- **Amostra pequena.** Mostrar volume e aviso por brawler, mapa e faixa. Usar a temporada ou o patch anterior como referência em um bloco próprio, identificando fonte e data. Evitar usar a referência como recomendação automática para brawlers ou mapas diretamente alterados. Uma futura previsão ponderada pode ser avaliada com dados históricos e exibida com rótulo próprio. Calibrar os mínimos depois de observar o volume por recorte.
- **Uma partida competitiva por ocorrência.** Preservar identificadores estáveis e a perspectiva correta do vencedor quando a mesma partida vem de várias tags. Quando uma segunda observação trouxer dados adicionais, enriquecer o registro sem duplicá-lo. Confirmar a granularidade do battlelog antes de chamar um registro de série ou draft completo.
- **Win rate.** Vitórias sobre participações com resultado decisivo. Exibir empates separadamente. A ordenação da tier list deve levar em conta volume e incerteza. Para comparar patches, alinhar mapa, modo, faixa competitiva e unidade da amostra. Mudanças de mapa ou composição da amostra também podem mover as taxas.
- **Pick rate.** A interface atual usa escolhas do brawler sobre o total de posições disponíveis. Se adicionarmos presença por partida, rotular separadamente. Assim, os denominadores ficam comparáveis entre páginas e fontes.
- **Ban rate.** Usar drafts com cobertura verificável. Contar a presença de um brawler banido uma vez por draft e publicar a cobertura dos bans. Campo ausente significa dado desconhecido. Recomendações de ban no Draft Lab usam seu próprio rótulo. O DraftMeta relata bans por jogador após 11/11. O parser pessoal hoje procura listas no nível da batalha ou do draft, e a amostra competitiva guarda as equipes e o resultado. Validar o JSON real antes de ampliar ambos.
- **Cobertura.** Exibir perfis consultados, qualificados e únicos, partidas válidas e novas, regiões descobertas, última coleta e atraso da fila. A seleção por troféus e Elo de perfis produz uma amostra observada, com possível concentração em jogadores e regiões. Faixa de lobby requer dados específicos da partida.
- **Comparação com a conta.** Mostrar a amostra da conta e a competitiva lado a lado no mesmo mapa, período e brawler. Vincular observações importadas à fonte e ao recorte próprios.

## 5. Portabilidade e armazenamento

| Destino | O que muda |
|---|---|
| Supabase ou PostgreSQL local | Mesmo adaptador. Trocam a URL e os parâmetros da conexão. Em caso de migração, copiar esquema e dados da aplicação, conferir permissões e validar a restauração |
| MySQL local | Adaptador próprio e migrações do MySQL. Reimplementar e testar o SQL de upsert, arrays, índices, bloqueios e agregações |
| Firestore | Adaptador e modelo documental próprios. Projetar coleções, índices, transações e agregações para os mesmos contratos. Avaliar o custo por operação |
| Parquet | Formato para arquivo histórico e reprocessamento. O painel pode continuar usando PostgreSQL para consultas rápidas e dados operacionais |

A aplicação deve depender de operações como gravar lote, carregar partidas de um recorte ou reservar uma rodada. O contrato precisa preservar resultados, atomicidade e concorrência. Os detalhes do banco ficam no adaptador. O histórico da conta, o detalhe competitivo e os agregados têm usos diferentes e serão medidos por tabela.

Em uma migração real, ensaiar restauração em banco descartável, aplicar migrações, conferir totais e chaves por patch e reproduzir leituras do painel. Fazer a virada com um coletor ativo por base de destino. Preservar a origem e planejar como reverter ou reconciliar novas escritas. Se a chave da Supercell cifrada for transferida, validar a chave de criptografia do ambiente de destino ou recadastrar a credencial no painel. O backend hospedado precisa de um caminho de rede autorizado para alcançar um banco instalado no Windows.

[Conexões PostgreSQL no Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres) · [Modelo documental do Firestore](https://firebase.google.com/docs/firestore/data-model)

## 6. Medidas que orientam escala e custo

| Medida | Uso |
|---|---|
| Tamanho real do banco, tabelas e índices | Separar custo do histórico pessoal, das partidas competitivas e das estruturas auxiliares. Acompanhar também a ocupação física de disco quando disponível |
| Partidas únicas novas por dia e bytes por partida | Estimar crescimento semanal e prazo até a cota. Medir com lotes representativos, contando índices |
| Requisições por endpoint, falhas, proporção de dados novos e idade da fila | Ajustar frequência, cache e tamanho dos lotes para ganhar cobertura com a mesma cota |
| Cobertura de bans, mapas, faixas e tempo de resposta | Decidir onde a análise já é confiável e quando vale pré-calcular ou arquivar |

O Supabase Free documenta uma cota de 500 MB de banco. O Fixie HTTP/S Free publica 500 requisições por mês. O coletor atual faz uma consulta de perfil por jogador e uma segunda de histórico para cada perfil qualificado. No ritmo de 20 perfis por rodada, com fila cheia e 96 rodadas diárias, seriam de 1.920 a 3.840 chamadas por dia, antes de rankings e da coleta pessoal. O consumo real depende de quantas rodadas acontecem e quantos jogadores são qualificados. Dimensionar a saída da coleta antes de aumentar a frequência.

[Limites do Supabase](https://supabase.com/kb/faqs/platform/database-only-cost) · [Cotas do Fixie](https://usefixie.com/pricing)
