# Análises do Ranqueado

## Navegação de Desempenho

| Aba | Pergunta | Conteúdo |
| --- | --- | --- |
| Resumo | Onde vale investigar primeiro? | Indicadores do recorte, barras de vitórias e derrotas por mapa, gráfico de win rate por modo e mapa para revisar. |
| Draft | Com quem vale jogar ou banir neste mapa? | Matriz mapa × brawler, pick frequente × efetivo, ficha por brawler, aliados e adversários. |
| Revisão | O que mudou entre uma vitória e uma derrota parecidas? | Comparação agregada, revisão pareada, placares e estatísticas por rodada. |
| Evolução | O que mudou ao longo do tempo e depois de um treino? | Indicadores e gráficos de win rate e volume semanal, comparação de temporadas, ficha do mapa, plano e histórico de treinos. |

Os filtros no topo definem o recorte das séries e ficam recolhidos no celular até abrir **Filtros**. As comparações por temporada e as referências externas indicam suas próprias janelas. Cada aba concentra seus controles locais. Tabelas usam rolagem interna e paginação. A matriz usa cores para o saldo e deixa as amostras com menos de três séries em tom neutro. Os gráficos mostram valores numéricos. Os resultados por mapa abrem a revisão, e as barras semanais abrem as partidas. A Visão geral conserva o atalho **Mapa para revisar**, que abre a aba **Revisão** com o mapa selecionado.

Na largura de desktop, a matriz fica ao lado da comparação de picks, e a comparação agregada fica ao lado da revisão pareada. Em Evolução, os dois gráficos semanais usam o mesmo calendário e abrem a mesma lista de séries. As semanas começam na segunda-feira em Brasília. Os gráficos mostram até seis semanas, terminando na semana da última série do recorte. Semanas intermediárias sem jogos aparecem no gráfico.

## Draft e preparação

| Análise | Situação | Recorte e entrega |
| --- | --- | --- |
| Matriz de cobertura mapa × brawler | Disponível | Uma célula por mapa e pick da conta. Win rate, número de séries e lista das partidas ao selecionar a célula. Mostrar opções com pelo menos três séries e sinalizar amostras menores. |
| Pick frequente × efetivo | Disponível | Comparar frequência e taxa de vitória no mapa. Usar todas as escolhas identificadas do mapa no denominador da frequência. |
| Melhores picks pessoais por mapa | Disponível | Ordenar pelo limite inferior de Wilson a partir de três séries decisivas. Exibir volume, pick rate, forma recente e dano ao cofre por minuto quando disponível. Abrir o mapa e a temporada no Draft Lab. |
| Confronto contra o próprio padrão | Disponível | Na ficha do brawler, selecionar um mapa e comparar séries contra o adversário com séries contra outros adversários no mesmo mapa, modo e pick. Mostrar as duas amostras com composição identificada. |
| Sinergia com aliados | Disponível | No mesmo mapa, modo e pick, comparar séries com e sem o aliado usando os dois aliados identificados. Mostrar dano ao cofre por minuto e sua amostra em Roubo. A comparação descreve os resultados observados. |
| Ban pessoal × ban da meta | Validado em teste, coleta real pendente | Comparar presença do adversário, derrotas, bans dos drafts da conta e bans dos registros competitivos no mesmo mapa e janela. Mostrar origem, denominadores e cobertura. Confirmar listas no primeiro lote real após a migração. |
| Bans consolidados externos | Disponível | Tabela completa do DraftMeta por mapa ou geral, Mestres+ por padrão. Preservar a janela e a classificação pelo rank médio do lobby. Ban rate usa os drafts com lista conhecida; presença usa todas as partidas. Mostrar cobertura e taxas de vitória publicada e bruta separadamente. |

## Revisão de partidas

| Análise | Situação | Recorte e entrega |
| --- | --- | --- |
| Vitória × derrota pareada | Disponível | Escolher uma derrota e encontrar uma vitória do mesmo mapa, modo e pick no recorte. Priorizar temporada e rank coincidentes quando conhecidos e, depois, proximidade pela data. Comparar a sequência de rodadas, métricas e placares com acesso aos dois detalhes. |
| Vitórias × derrotas agregadas | Disponível | Comparar eliminações, mortes, dano causado, dano recebido, cura e objetivo para um mapa e pick. Mostrar cobertura por métrica e resultado. |
| Conversão da primeira rodada | Disponível | Agrupar por mapa ou brawler e comparar vitórias na série após ganhar ou perder a abertura. Cada taxa abre a amostra. Empates na abertura ficam fora das duas amostras. |
| Contribuição no objetivo × combate | Disponível | Em Roubo, comparar dano causado e dano ao cofre por minuto. Cada ponto representa uma série, mostra o resultado pela cor e abre o placar. A tabela paginada mostra os mesmos dados. |
| Composição das derrotas | Disponível | Alternar entre adversários, duplas e trios. Ordenar por séries enfrentadas e desempatar por derrotas. A presença usa as derrotas com os três adversários identificados. Cada linha abre as derrotas da combinação. |
| Mapa para revisar | Disponível | Destacar o maior saldo de derrotas, listar picks e adversários e abrir as séries correspondentes. |

## Evolução

| Análise | Situação | Recorte e entrega |
| --- | --- | --- |
| Diagnóstico da mudança no win rate | Disponível | Comparar as temporadas do recorte selecionado e decompor a diferença em frequência dos mapas, resultado dentro de cada mapa e contribuição dos mapas sem comparável. Cada linha abre as séries por período. |
| Antes × depois do balanceamento | Disponível | Comparar janelas de mesma duração dentro dos dois patches, usando mapa, modo e pick. Mostrar combinações exclusivas e abrir as partidas dos dois períodos. Usar a Meta quando as janelas completas coincidirem. |
| Início × fim de sessão | Disponível | Usar as sessões de Progressão e comparar as duas metades com séries em cada lado. Mostrar o intervalo registrado, resultados em ordem e acesso às partidas. |
| Efeito do treino | Disponível | Salvar no plano a métrica a acompanhar e comparar antes e durante. Mostrar win rate, cobertura da métrica e dano ao cofre por minuto em Roubo. Abrir a amostra do plano ativo ou dos planos arquivados. |
| Elo por placar | Disponível | Separar médias de 2–0, 2–1, 1–2, 0–2 e partidas únicas. Exigir variações isoladas, mesma temporada e opcionalmente a divisão atual. Mostrar cobertura e aplicar uma média editável ao plano de subida. |

## Validação das entregas

O build do Next.js e os testes do backend passaram. No PostgreSQL descartável, o teste conferiu repetição da coleta sem duplicatas, listas vazias, listas conflitantes e contagens de bans por janela. A validação também restaurou o banco e comparou os registros competitivos. O recorte da rodada real de Bridge Too Far confirmou os seis bans e a cobertura de um registro ao passar pelo agregador. [Validação no GitHub Actions](https://github.com/DiasMath/Brawl-ranked-data/actions/runs/43958213689)

Em produção, conferir **Meta → Amostra de outros jogadores** após uma coleta agendada e selecionar o mesmo mapa e janela em **Desempenho → Draft → Bans da conta × meta**. A taxa deve usar só os registros com lista conhecida. Para uma coleta manual, usar a janela Hoje ou 7 dias.

## Critérios de dados

- Contar cada partida concluída uma vez nas comparações de vitória e derrota. Nas regras de novembro, um rank ou pontos oficiais da própria partida podem identificar formato de partida única. Sem essa informação, uma rodada isolada permanece com resultado em aberto. Nas séries, duas vitórias ou derrotas confirmam o resultado; o detalhe conserva as rodadas e suas estatísticas.
- Usar vitórias e derrotas como denominador do win rate. Exibir valores ausentes como `—` e conservar o zero observado.
- Calcular taxas por minuto com as durações registradas. Exigir dados completos das métricas somadas e dos integrantes usados para calcular a participação da equipe. Só somar métricas de objetivo quando a unidade e o tipo forem compatíveis.
- Exibir origem, período, filtros e tamanho das amostras. Rank e temporada ausentes podem reduzir a comparabilidade. Resultados observados, incluindo os de treinos e balanceamentos, são descritivos.
- Confirmar a cobertura dos bans competitivos na primeira coleta real após a migração `008_competitive_bans`. Conferir a presença de um brawler em um registro com lista completa, a contagem por mapa e o mesmo dado em Draft e Meta. A ausência de lista continua fora do denominador.
