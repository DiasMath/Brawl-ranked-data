# Pendências de desenvolvimento

Lista de trabalho do Brawl Ranked Data, em ordem de execução no ambiente local.

| Etapa | Entrega | Estado | Critério de conclusão |
| --- | --- | --- | --- |
| 1 | Contar partidas agrupadas na Progressão | Concluída no código e validada em teste | Uma vitória por 2–1 conta como uma partida e uma vitória nas sessões, no ritmo diário e no win rate sugerido. Os filtros de período e temporada mantêm a série inteira. |
| 2 | Sugerir ganhos e perdas no plano de subida | Concluída no código e validada em teste | Reaproveitar variações de Elo isoladas no mesmo recorte, mostrar a quantidade de vitórias e derrotas usadas em cada sugestão e permitir edição. Quando faltar amostra, manter a entrada manual. |
| 3 | Mostrar a evolução por brawler | Concluída no código e validada em teste | Usar todo o histórico coletado ou uma temporada para win rate e pick rate pessoais. Comparar as últimas 10 partidas decisivas com as até 10 anteriores na forma recente. Respeitar modo e mapa e mostrar a amostra de cada taxa. |
| 4 | Conferir o histórico com partidas reais | Validação parcial | Comparar as partidas da coleta pessoal com o histórico dentro do jogo. Conferir placar, quantidade e ordem das rodadas, duração, craque e viradas. Registrar divergências com o campo recebido e o valor mostrado. |
| 5 | Uniformizar a contagem nas sugestões pessoais e no treino | Concluída no código e validada em teste | Contar uma série uma única vez nas sugestões do Draft Lab, na busca de counters da conta e no acompanhamento do plano de treino. Permitir limitar a fonte pessoal do Draft Lab por temporada e mapa. |

## Critérios para os dados

- Aplicar o agrupamento de rodadas antes dos filtros. A data da partida segue o dia em Brasília da última rodada, como no Histórico.
- Usar vitórias e derrotas no denominador do win rate. Empates e séries com resultado em aberto entram no volume de atividade.
- Identificar o agrupamento e as variações de Elo deduzidas como estimativas. Exibir rank, K/D, bans e outras estatísticas da partida quando a fonte trouxer dados suficientes.
- Atualizar esta lista ao concluir cada etapa e registrar aqui a validação feita.

## Validação da etapa 1

O teste da tela confirmou a contagem de uma vitória por 2–1, o filtro de uma série que atravessou a meia-noite em Brasília, a separação de sessões por intervalo e temporada e o uso de partidas decisivas no win rate sugerido. Também conferiu que as leituras de Elo entre rodadas aparecem na sessão e que uma série com resultado em aberto entra no volume de atividade. A conferência com partidas reais segue na etapa 4.

## Validação da etapa 2

O plano calcula separadamente a média dos ganhos em vitórias e a média dos pontos perdidos em derrotas no período e na temporada selecionados. Cada média mostra quantas partidas têm uma variação de Elo isolada pelas leituras de perfil. O botão copia a sugestão para o campo editável. Sem amostra para um dos resultados, o campo continua disponível para preenchimento manual.

Os testes conferiram as médias com amostras de tamanhos diferentes, a mudança de período e temporada, a exclusão de séries em aberto e partidas fora do Ranqueado e a edição após aplicar uma sugestão.

## Validação da etapa 3

A ficha de brawlers tem recorte próprio de período. Por padrão, usa todo o histórico coletado e permite selecionar uma temporada. O pick rate pessoal divide as escolhas do brawler pelas partidas da conta com pick identificado no mesmo recorte. O win rate divide as vitórias pelas partidas decisivas, contando cada série agrupada uma vez. A forma recente usa janelas separadas de até 10 decisivas.

Só as partidas com temporada identificada entram no recorte daquela temporada. A tabela mostra vitórias, derrotas e a base do pick rate. A ordenação por win rate e amostra usa o limite inferior de Wilson já disponível no painel. Os testes conferiram o histórico completo, a cobertura, a série 2–1, as janelas e os filtros de temporada, modo e mapa.

Para escolher picks, use a temporada e compare opções no mesmo mapa e modo. Abra o Draft Lab para considerar aliados, adversários e bans da composição. Para treinar, procure quedas de forma em recortes comparáveis e use a ficha do mapa para revisar uma vitória e uma derrota. Os números da conta descrevem os seus resultados e a frequência das suas escolhas. A referência competitiva segue o patch, o mapa e a amostra da fonte.

[Recortes de win rate e pick rate do DraftMeta](https://draftmeta.com/games/brawl-stars/win-rates) · [Modelo de draft do DraftMeta](https://draftmeta.com/model) · [Intervalo de Wilson no NIST](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)

## Validação parcial da etapa 4

Em 14/11/2026, uma leitura externa da conta no DraftMeta continha 25 registros recentes. Entre eles, 12 estavam classificados como `soloRanked`. Por horário, mapa, brawler e composição dos dois lados, eles formavam seis pares compatíveis com séries, três com duas vitórias e três com duas derrotas. A leitura externa trouxe os brawlers dos dois times. Faltavam as tags dos participantes, a duração e o craque. Essa amostra fornece placares esperados para comparação e não confirma o agrupamento do painel, que também usa as tags. Ainda falta observar uma virada após perder a primeira rodada.

| Verificação | Evidência para concluir |
| --- | --- |
| Série e ordem das rodadas | Comparar o placar e as rodadas do histórico do jogo com **Partidas → Detalhe**. Usar mapa, brawler e sequência de resultados para identificar a mesma série. |
| Duração | Conferir `battle.duration` na rodada correspondente no JSON da API. O tempo da série soma as durações das rodadas quando todas estão presentes. |
| Craque | Conferir `battle.starPlayer` no JSON de cada rodada e comparar com o nome mostrado no jogo. |
| Virada | Usar uma série com derrota, vitória e vitória. Ela deve aparecer como vitória por 2–1 e acrescentar uma virada em **Desempenho → Duração e viradas**, no mesmo recorte. |

No dev, **Contas e dados → Exportar histórico** reúne os registros do painel e o JSON das partidas coletadas. Para fechar a comparação, usar esse arquivo e capturas do detalhe das mesmas partidas dentro do jogo. Registrar divergências com o horário, o mapa, o campo da API, o valor exibido e a evidência do jogo.

## Validação da etapa 5

Em **Draft Lab → Recomendações → Minha conta**, o recorte usa o mapa do draft e permite escolher todo o histórico ou uma temporada. Picks, sugestões de ban por derrotas observadas e counters pessoais usam o resultado das séries. A ficha do mapa também usa séries na comparação da conta com a referência competitiva.

Em **Desempenho → Próxima sessão**, o plano conta as séries cuja primeira e última rodadas registradas estão no intervalo do treino. O teste confirmou que uma vitória por 2–1 entra uma vez, que enfrentar dois alvos em uma série não duplica o total de confrontos e que os filtros de temporada e mapa mudam a amostra das sugestões.
