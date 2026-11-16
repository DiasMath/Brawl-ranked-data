# Pendências de desenvolvimento

Lista de trabalho do Brawl Ranked Data, em ordem de execução no ambiente local.

O desenho das abas e a lista de novas análises estão em [Análises do Ranqueado](docs/ANALISES_RANQUEADO.md).

| Etapa | Entrega | Estado | Critério de conclusão |
| --- | --- | --- | --- |
| 1 | Contar partidas agrupadas na Progressão | Concluída no código e validada em teste | Uma vitória por 2–1 conta como uma partida e uma vitória nas sessões, no ritmo diário e no win rate sugerido. Os filtros de período e temporada mantêm a série inteira. |
| 2 | Sugerir ganhos e perdas no plano de subida | Concluída no código e validada em teste | Reaproveitar variações de Elo isoladas no mesmo recorte, mostrar a quantidade de vitórias e derrotas usadas em cada sugestão e permitir edição. Quando faltar amostra, manter a entrada manual. |
| 3 | Mostrar a evolução por brawler | Concluída no código e validada em teste | Usar todo o histórico coletado ou uma temporada para win rate e pick rate pessoais. Comparar as últimas 10 partidas decisivas com as até 10 anteriores na forma recente. Respeitar modo e mapa e mostrar a amostra de cada taxa. |
| 4 | Conferir o histórico com partidas reais | Validação parcial | Comparar as partidas da coleta pessoal com o histórico dentro do jogo. Conferir placar, quantidade e ordem das rodadas, duração, craque e viradas. Registrar divergências com o campo recebido e o valor mostrado. |
| 5 | Uniformizar a contagem nas sugestões pessoais e no treino | Concluída no código e validada em teste | Contar uma série uma única vez nas sugestões do Draft Lab, na busca de counters da conta e no acompanhamento do plano de treino. Permitir limitar a fonte pessoal do Draft Lab por temporada e mapa. |
| 6 | Alinhar os indicadores pessoais de draft e meta | Concluída no código e validada em teste | Calcular os picks e bans por série. Dar aos indicadores pessoais um recorte por temporada ou histórico inteiro e mostrar a cobertura dos bans. Usar séries nas comparações da conta com a meta. |
| 7 | Levar os resultados por brawler e mapa ao Draft Lab | Concluída no código e validada em teste | Mostrar win rate, pick rate e amostra por mapa para o brawler escolhido. Abrir o Draft Lab no mapa e na temporada da ficha, com a fonte pessoal e a aba Picks. |
| 8 | Detalhar os confrontos do brawler | Concluída no código e validada em teste | Mostrar vitórias, derrotas e cobertura por adversário. Respeitar a temporada, o mapa e o modo da ficha e abrir diretamente o detalhe da última vitória ou derrota do confronto. |
| 9 | Analisar os aliados do brawler | Concluída no código e validada em teste | Mostrar o desempenho observado com cada aliado no mesmo recorte da ficha, com resultados decisivos e links para a última vitória e derrota disponíveis. |
| 10 | Acompanhar um treino por mapa e brawler | Concluída no código e validada em teste | Permitir preencher o plano pela ficha do brawler e comparar o resultado do treino com partidas anteriores do mesmo recorte. |
| 11 | Preservar o histórico de treinos | Concluída no código e validada em teste | Arquivar o plano anterior ao trocar o ajuste, mapa ou brawler. Exibir período, estado, amostras e variação nas taxas e incluir os planos arquivados na exportação. |
| 12 | Mostrar a cobertura do histórico coletado | Concluída no código e validada em teste | Mostrar quantas ranqueadas têm duração total, craque, K/D oficial e lista de bans. Abrir uma partida recente com cada campo disponível para conferência. |
| 13 | Filtrar as execuções da coleta | Concluída no código e validada em teste | Aplicar filtros por status e origem antes da paginação no PostgreSQL e exibir a duração das execuções com horário de término. |

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

Só as partidas com temporada identificada entram no recorte daquela temporada. A tabela mostra vitórias, derrotas e a base do pick rate. A opção de win rate ordena pela taxa exibida, da maior para a menor, e desempata pela amostra. Os testes conferiram o histórico completo, a cobertura, a série 2–1, as janelas e os filtros de temporada, modo e mapa.

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

## Validação da etapa 6

Em **Picks, bans e counters**, a seção da conta usa o histórico inteiro ou a temporada escolhida, com o filtro de mapa da tela. Selecionar um brawler restringe os itens do ranking de picks e conserva o total de escolhas identificadas no denominador. A comparação da conta com a Meta usa uma partida por série dentro da janela da referência.

A cobertura de bans divide as séries com lista oficial conhecida pelo total do recorte. Uma lista vazia explícita conta na cobertura e registra zero bans. Quando as rodadas trazem listas oficiais diferentes, a série fica sem lista consolidada e o detalhe conserva a lista de cada rodada. Os testes conferiram picks, win rate, filtros, listas repetidas e conflitantes e a diferença entre zero bans e ausência da lista.

## Validação da etapa 7

Em **Desempenho → Evolução por brawler**, a tabela por mapa usa o brawler, a temporada, o modo e o mapa selecionados na ficha. Cada linha calcula o pick rate sobre as partidas com escolha conhecida naquele mapa. A ordenação usa win rate e tamanho da amostra.

O botão da tabela abre o **Draft Lab** no mapa da linha, com a mesma temporada da ficha ou todo o histórico. Ele abre **Minha conta → Picks** e deixa a composição disponível para montar. O teste confirmou o denominador por mapa, a troca de temporada e o recorte que chega às recomendações do Draft Lab.

## Validação da etapa 8

A tabela **Confrontos** em **Desempenho → Draft → Evolução por brawler** mostra o resultado da equipe quando enfrentou cada adversário no recorte. O mesmo adversário conta uma vez por série, mesmo quando aparece em mais de uma rodada. A cobertura informa quantas séries registraram ao menos um adversário. O win rate usa os resultados decisivos. A ordenação começa pelo número de partidas e desempata pelas derrotas ou vitórias, conforme a opção selecionada.

Os testes confirmaram a deduplicação, o tratamento de séries em aberto e sem composição, o filtro de temporada, a ordenação e a abertura de uma vitória por 2–1 diretamente no histórico.

## Validação da etapa 9

Em **Desempenho → Draft → Evolução por brawler**, alterne entre **Adversários** e **Aliados**. A aba de aliados mostra o win rate da equipe quando o brawler esteve no mesmo time, com vitórias, derrotas e cobertura. Ela abre ordenada pelo número de partidas, com desempate pelo número de vitórias. Cada aba mantém sua própria ordenação.

O teste verificou que aliados, adversários e o próprio pick entram nos grupos corretos. Também conferiu a deduplicação por série, a amostra com temporada selecionada, a troca de abas e a abertura da partida pelo aliado.

## Validação da etapa 10

Em **Desempenho → Evolução por brawler**, o botão **Treinar** preenche o mapa e o brawler em **Próxima sessão**. Os campos aceitam o recorte específico ou todos os mapas e brawlers. O treino salvo acompanha séries da conta que começaram e tiveram a última rodada registrada dentro do seu intervalo.

A referência usa as partidas decisivas mais recentes antes do treino no mesmo recorte, até o volume de decisivas observado durante o treino. A comparação mostra a amostra e a diferença em pontos percentuais quando há dados dos dois períodos. Salvar uma mudança de ajuste, mapa ou brawler inicia um novo intervalo para o plano. Os testes confirmaram o preenchimento a partir da ficha, a persistência da escolha, a compatibilidade com planos sem filtro e a exclusão de séries fora do recorte ou que começaram antes do início.

## Validação da etapa 11

Em **Desempenho → Histórico de treinos**, aparecem os planos anteriores que foram substituídos. Cada linha mostra o ajuste, o recorte, o intervalo, o resultado antes e durante e a variação em pontos percentuais quando as duas amostras têm resultados decisivos. A data final usa a conclusão registrada ou, se o plano estava em andamento, a data em que foi substituído.

Editar o estado do mesmo ajuste e recorte preserva o plano. Os testes conferiram a conclusão, a troca de plano, o corte das partidas após o fim, a preservação durante a sincronização e a inclusão do histórico no JSON exportado. Os planos ficam salvos por conta neste navegador.

## Validação da etapa 12

Em **Contas e dados → Cobertura do histórico**, a base são as partidas ranqueadas já coletadas da conta, com uma contagem por série. A duração total exige tempo em todas as rodadas. O craque exige identificação em pelo menos uma rodada. K/D usa os dados oficiais disponíveis para o total da partida. Bans exigem uma lista oficial consistente entre as rodadas que o informaram. Uma lista oficial vazia entra na cobertura.

O atalho **Ver partida** abre o detalhe mais recente com aquele campo, na rodada que contém a evidência quando ela é específica. Os testes conferiram a ausência de dados, duração parcial, K/D anotado, lista vazia, listas conflitantes e os atalhos. A comparação com a tela do jogo continua pendente na etapa 4.

## Validação da etapa 13

Em **Contas e dados → Histórico de atualizações**, combine os filtros de status e origem para encontrar execuções da conta. A consulta filtra antes de retornar cada página de 15 registros. A coluna **Duração** usa os horários de início e término. Execuções sem origem registrada aparecem na visão geral com o campo vazio.

Os testes conferiram filtros combinados, troca de página com inserção de um novo log, isolamento por conta, validação dos parâmetros e comportamento da tela quando o FastAPI ainda está em uma versão anterior.
