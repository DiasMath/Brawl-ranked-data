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
| Matriz de cobertura mapa × brawler | Primeira entrega | Uma célula por mapa e pick da conta. Win rate, número de séries e lista das partidas ao selecionar a célula. Mostrar opções com pelo menos três séries e sinalizar amostras menores. |
| Pick frequente × efetivo | Disponível | Comparar frequência e taxa de vitória no mapa. Usar todas as escolhas identificadas do mapa no denominador da frequência. |
| Melhores picks pessoais por mapa | Próxima etapa | Combinar aproveitamento, volume, evolução recente e a métrica do objetivo quando disponível. Expor cada evidência e abrir o mapa no Draft Lab. |
| Confronto contra o próprio padrão | Próxima etapa | Para o mesmo mapa e pick, comparar resultados contra o adversário escolhido com os resultados contra outros. Mostrar as duas amostras. |
| Sinergia com aliados | Próxima etapa | No mesmo mapa e pick, comparar séries com e sem o aliado. Mostrar objetivo quando disponível. A comparação descreve os resultados observados. |
| Ban pessoal × ban da meta | Próxima etapa | Cruzar presença do adversário no mapa, resultados pessoais e referência competitiva. Exibir fontes, janelas e tamanhos das amostras. |

## Revisão de partidas

| Análise | Situação | Recorte e entrega |
| --- | --- | --- |
| Vitória × derrota pareada | Primeira entrega | Escolher uma derrota e encontrar uma vitória do mesmo mapa, modo e pick no recorte. Priorizar temporada e rank coincidentes quando conhecidos e, depois, proximidade pela data. Comparar a sequência de rodadas, métricas e placares com acesso aos dois detalhes. |
| Vitórias × derrotas agregadas | Disponível | Comparar eliminações, mortes, dano causado, dano recebido, cura e objetivo para um mapa e pick. Mostrar cobertura por métrica e resultado. |
| Conversão da primeira rodada | Próxima etapa | Comparar séries vencidas após ganhar e após perder a abertura. Agrupar por mapa ou pick, manter empates da abertura fora das duas amostras e abrir as séries de cada grupo. O indicador de viradas já existe por modo e mapa. |
| Contribuição no objetivo × combate | Próxima etapa | Em Roubo, plotar dano causado por minuto contra dano ao cofre por minuto. Um ponto por série com ambas as métricas, cor pelo resultado e clique para abrir o placar. |
| Composição das derrotas | Próxima etapa | Exibir adversários, pares e depois trios recorrentes. Cada combinação conta uma vez por série. Mostrar frequência nas derrotas, volume e recorte. |
| Mapa para revisar | Disponível | Destacar o maior saldo de derrotas, listar picks e adversários e abrir as séries correspondentes. |

## Evolução

| Análise | Situação | Recorte e entrega |
| --- | --- | --- |
| Diagnóstico da mudança no win rate | Planejada | Comparar períodos e decompor a mudança em participação dos mapas e resultado dentro de cada mapa. Exibir mapas sem comparável em separado e abrir as séries por período. |
| Antes × depois do balanceamento | Planejada | Comparar janelas antes e depois do patch em mapas e picks presentes nas duas. Informar o patch, dias cobertos, mudanças no conjunto de mapas e referência da meta quando comparável. |
| Início × fim de sessão | Planejada | Usar o critério de intervalo entre partidas adotado em Progressão para reconstruir sessões. Comparar pontos da sessão com amostra, duração e sequências observadas. |
| Efeito do treino | Evolução do plano existente | Comparar janelas antes e durante no mesmo mapa e pick. Acompanhar a métrica escolhida, como mortes por minuto, junto de dano ao objetivo e win rate. Preservar anotações, períodos, histórico e partidas da amostra. |

## Critérios de dados

- Contar séries concluídas uma vez nas comparações de vitória e derrota. O detalhe mostra a ordem das rodadas registradas e conserva o acesso às estatísticas da API.
- Usar vitórias e derrotas como denominador do win rate. Exibir valores ausentes como `—` e conservar o zero observado.
- Calcular taxas por minuto com as durações registradas. Exigir dados completos das métricas somadas e dos integrantes usados para calcular a participação da equipe. Só somar métricas de objetivo quando a unidade e o tipo forem compatíveis.
- Exibir origem, período, filtros e tamanho das amostras. Rank e temporada ausentes podem reduzir a comparabilidade. Resultados observados, incluindo os de treinos e balanceamentos, são descritivos.
- Priorizar, na sequência, conversão da primeira rodada e gráfico de objetivo, análise de confrontos e aliados, métricas de treino e diagnóstico de mudança no aproveitamento.
