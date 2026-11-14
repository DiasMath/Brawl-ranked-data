# Brawl Ranked Data

Painel privado do Ranqueado de Brawl Stars. Use Next.js, FastAPI e PostgreSQL no Windows para desenvolver. Em produção, a Vercel hospeda o Next.js, o Render executa o FastAPI e o Supabase conserva o histórico.

| Ambiente | Frontend | Backend | Banco | Chave da Supercell |
| --- | --- | --- | --- | --- |
| Desenvolvimento | `http://127.0.0.1:3000` | `http://127.0.0.1:8787` | Supabase ou PostgreSQL local | Autorizada para o IPv4 público da sua conexão |
| Produção | Vercel | Render | PostgreSQL do Supabase | Autorizada para o IPv4 de saída usado pelo backend |

## Estrutura

| Pasta ou arquivo | Uso |
| --- | --- |
| `frontend/` | Next.js App Router, autenticação de acesso e conexão privada com o backend |
| `backend/` | FastAPI, coleta oficial, esquema PostgreSQL e histórico persistente |
| `render.yaml` | Blueprint opcional para a API do Render |
| `render.cron.yaml` | Blueprint opcional para criar o Cron Job pago separadamente |
| `Agendar-DraftMeta.ps1` | Atualiza a Meta geral e todos os mapas do pool ranqueado do DraftMeta |
| `Agendar-Partidas.ps1` | Testa ou registra a coleta pessoal de contas escolhidas no Windows |
| `Agendar-Meta.ps1` | Registra e inicia a coleta competitiva no Agendador de Tarefas do Windows |
| `Preparar-Ambiente.ps1` | Gera as credenciais próprias do painel e preenche os arquivos locais de ambiente |
| `Iniciar-Backend.ps1` | Executa o FastAPI no Windows com o arquivo do ambiente selecionado |
| `Iniciar-Dev.ps1` | Abre o FastAPI e o Next.js com um comando na raiz |

## Desenvolvimento no Windows

Use Python 3.12 e Node.js 20.9 ou superior. Abra o PowerShell em `D:\PROJETOS\BRAWL RANKED DATA`.

### Banco de desenvolvimento

Para usar Supabase, abra **Connect → Session pooler**, copie a URL da porta `5432`, substitua o campo da senha e inclua `sslmode=require`. Use essa URL em `DATABASE_URL`. Se dev e prod usarem a mesma URL, os dois ambientes compartilham contas e partidas. Use um projeto Supabase separado se quiser isolar os dados.

Para usar o banco na sua máquina, instale o [PostgreSQL para Windows](https://www.postgresql.org/download/windows/).

No pgAdmin, conecte-se ao PostgreSQL local e execute as duas instruções separadamente. Substitua `SUA_SENHA_LOCAL` por uma senha própria para esse usuário.

```sql
CREATE ROLE brawl_dev LOGIN PASSWORD 'SUA_SENHA_LOCAL';
```

```sql
CREATE DATABASE brawl_ranked_dev OWNER brawl_dev;
```

No banco local, use `postgresql://brawl_dev:SUA_SENHA_LOCAL@127.0.0.1:5432/brawl_ranked_dev`. Para ambas as opções, codifique caracteres reservados da senha na URL, como `@` (`%40`) ou `#` (`%23`). O FastAPI cria as tabelas na primeira execução.

### Credenciais locais

No [portal da Supercell](https://developer.brawlstars.com/), gere uma chave para o IPv4 público que a máquina Windows usa para acessar a internet. Se esse endereço mudar, atualize a autorização da chave. Use uma chave própria de dev e um banco separado para que as coletas locais gravem no ambiente de desenvolvimento.

```powershell
.\Preparar-Ambiente.ps1 -Dev
```

Informe a URL do banco escolhido. O script cria `frontend/.env.development.local` e `backend/.env.development.local` com uma senha para o painel local, um token de serviço compartilhado e uma chave de criptografia para o backend. Os arquivos preenchidos ficam fora do Git.

Se já usa os arquivos de dev, remova a variável antiga `BRAWL_API_TOKEN` e adicione `BRAWL_ENVIRONMENT=development` e `BRAWL_CREDENTIAL_KEY` ao arquivo do backend. Gere o valor de criptografia com Python e mantenha-o fixo para conseguir ler a chave salva.

```powershell
py -3.12 -c "import secrets; print(secrets.token_hex(32))"
```

Com o painel aberto, acesse **Contas e dados → Chave da Supercell**, cole a chave de API e clique em **Validar e salvar**. A validação usa o mesmo servidor que fará a sincronização. Após uma validação bem-sucedida, o FastAPI grava a chave criptografada em um esquema privado do PostgreSQL. Repita pelo painel ao renovar a chave.

### Iniciar o painel

Com os arquivos de dev preenchidos, execute o comando na raiz do projeto.

```powershell
npm.cmd run dev
```

Na primeira execução, o comando cria `backend/.venv` usando `py -3.12` e instala as dependências. Nos próximos inícios, reaproveita a instalação e executa de novo a instalação correspondente se mudarem os arquivos de requisitos ou o `package-lock.json` do frontend.

Em seguida, o comando abre duas janelas, uma com os logs do FastAPI na porta 8787 e outra com os logs do Next.js na porta 3000. Para encerrar o ambiente, pressione `Ctrl+C` em cada janela. Você também pode iniciar os dois serviços diretamente com `.\Iniciar-Dev.ps1`.

Abra `http://127.0.0.1:3000` e entre com `BRAWL_SITE_USER` e `BRAWL_SITE_PASSWORD` de `frontend/.env.development.local`. Em **Contas e dados**, adicione um jogador pela tag. Com a chave configurada, a primeira consulta da conta selecionada começa automaticamente. Use **Sincronizar agora** para buscar uma atualização. Se precisar confirmar que o FastAPI subiu, acesse `http://127.0.0.1:8787/health`.

### Agendar a coleta pessoal no Windows

Abra o painel local, cadastre as contas desejadas e valide a chave da Supercell para o IP público do Windows. Na raiz do projeto, substitua `TAG_DA_CONTA` pela tag cadastrada, teste uma rodada e depois registre a tarefa.

```powershell
.\Agendar-Partidas.ps1 -Tags 'TAG_DA_CONTA' -TestarAgora
.\Agendar-Partidas.ps1 -Tags 'TAG_DA_CONTA' -IntervaloMinutos 5
```

Para duas contas, informe `-Tags 'TAG_DA_CONTA','TAG_DA_SEGUNDA_CONTA'`, substituindo a segunda tag pela real. A tarefa usa `backend/.env.development.local` e grava no banco indicado em `DATABASE_URL`. Se quiser que o painel publicado leia essas partidas, o Windows e o Render precisam usar o mesmo banco. A chave usada pelo Windows continua sendo a do ambiente local escolhido.

O script valida o cadastro das contas e a credencial, solicita a primeira execução e repete a cada cinco minutos por padrão. O Windows deve estar ligado e o usuário conectado. O Next.js e o FastAPI locais podem estar fechados. Para mudar tags ou intervalo, execute novamente o comando de registro. Para manter o indicador de atraso coerente com o agendamento, ajuste `BRAWL_COLLECTION_INTERVAL_SECONDS` no ambiente do FastAPI que atende o painel. Cinco minutos correspondem a `300`.

```powershell
Get-ScheduledTaskInfo -TaskName 'Brawl Ranked Data - Partidas (development)'
Get-Content .\backend\.venv\partidas-coleta-development.log -Tail 20
```

A tela **Contas e dados** mostra a última coleta agendada bem-sucedida. Uma execução com zero novas partidas pode indicar que o histórico da API ainda não mudou. Se houver uma possível lacuna, o painel sinaliza a data em que ela foi detectada. A coleta agendada consulta apenas as tags escolhidas. O botão manual continua consultando somente a conta selecionada.

## Produção na Vercel e no Render

Configure os valores de produção diretamente nos painéis, com senha e token de serviço próprios de produção. Se você já tem os arquivos antigos com credenciais de produção, renomeie-os localmente.

| Arquivo antigo | Novo nome |
| --- | --- |
| `frontend/.env.local` | `frontend/.env.production.local` |
| `backend/.env` | `backend/.env.production.local` |

Se precisar gerar novos arquivos de produção, execute `.\Preparar-Ambiente.ps1 -RenderUrl https://SEU-SERVICO.onrender.com` sem `-Dev`. Use os valores como referência para os painéis. O Next.js seleciona o arquivo de dev ao executar `npm run dev` e o de produção ao executar `npm run build` ou `npm start`. Para executar o FastAPI no Windows com o arquivo de produção, use `.\Iniciar-Backend.ps1 -Ambiente production`. Essa execução usa o banco de produção se a URL configurada apontar para ele.

### 1. PostgreSQL

Crie um banco persistente no Supabase ou no Render. Use a URL de conexão do PostgreSQL como `DATABASE_URL` no backend. Se usar Supabase com conexão IPv4, abra **Connect** e copie a URL do **Session pooler** (porta 5432). Na produção, use uma conexão TLS. Para o Supabase, inclua `sslmode=require` na URL. A API e o coletor criam o esquema `brawl_lab` no primeiro início. O usuário do banco precisa ter permissão para criá-lo.

### 2. Render Web Service e Cron Job

Conecte o repositório ao Render e crie um **Web Service** com runtime **Python**. O Web Service atende o painel e a sincronização manual. Um Cron Job separado pode consultar a API da Supercell e gravar no PostgreSQL, mesmo com o Web Service em repouso. O plano gratuito do Render pode demorar para responder após inatividade. O Cron Job do Render tem cobrança mínima de US$ 1 por mês.

| Campo | Valor |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health Check Path | `/health` |

| Variável | Valor |
| --- | --- |
| `PYTHON_VERSION` | `3.12.12` |
| `BRAWL_PLAYER_TAG` | Opcional. Adiciona uma conta inicial na primeira execução |
| `BRAWL_COLLECTION_INTERVAL_SECONDS` | `300` para exibir o intervalo no painel |
| `BRAWL_SERVICE_TOKEN` | Valor de produção de `backend/.env.production.local` |
| `DATABASE_URL` | URL do banco com suas credenciais |
| `BRAWL_ENVIRONMENT` | `production` |
| `BRAWL_CREDENTIAL_KEY` | 32 bytes aleatórios em hexadecimal, próprios de produção |

Para migrar um deploy existente, configure `BRAWL_CREDENTIAL_KEY` no Render, remova `BRAWL_API_TOKEN` do Render e, caso exista, da Vercel, e publique a atualização. Cadastre a chave da Supercell pelo painel em produção. As chaves de dev e produção ficam em registros separados mesmo quando usam o mesmo Supabase. Mantenha `brawl_secrets` fora da lista de esquemas expostos do Supabase.

#### Coleta agendada opcional no Render

Crie um **Cron Job** no mesmo repositório. Use a mesma `DATABASE_URL`, `BRAWL_CREDENTIAL_KEY` e `BRAWL_ENVIRONMENT=production` no Cron Job e no Web Service. Defina `BRAWL_SCHEDULED_PLAYER_TAGS` no Cron Job com as tags cadastradas, separadas por vírgula. A variável antiga `BRAWL_SCHEDULED_PLAYER_TAG` continua funcionando para uma conta. Sem tags e com a coleta competitiva desativada, o job encerra sem consultar a Supercell. O cron usa a chave cadastrada em produção. Autorize na chave a saída dos serviços que farão consultas. O token `BRAWL_SERVICE_TOKEN` é usado somente na Vercel e no Web Service.

| Campo | Valor |
| --- | --- |
| Runtime | Python |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements-collector.txt` |
| Command | `python -m app.jobs.collect` |
| Schedule | `*/5 * * * *` (UTC) |
| `PYTHON_VERSION` | `3.12.12` |

Se a API já existe, crie somente o Cron Job. O comando antigo da API ainda funciona. Para uma instalação nova, use `render.yaml` para a API e selecione `render.cron.yaml` como caminho do Blueprint quando quiser criar o Cron Job. A antiga variável `BRAWL_POLL_SECONDS` pode ser removida do Web Service. A frequência real é configurada no agendamento do Cron Job.

Em **Connect → Outbound**, confira os endereços de saída de ambos os serviços. Se a Supercell aceitar apenas IPs individuais, os blocos compartilhados do Render exigem uma saída estável autorizável para coleta confiável. Depois de cadastrar a chave pelo painel, use **Runs → Trigger Run** no Cron Job e confirme a última coleta em **Contas e dados**. A coleta agendada e o botão manual compartilham o bloqueio no banco e respeitam o intervalo de espera após HTTP 429.

### 3. Vercel

Crie um projeto Next.js no mesmo repositório com **Root Directory** em `frontend`. Use as configurações de build padrão do Next.js. Cadastre as variáveis abaixo em **Settings → Environment Variables** para Production e, se desejar, Preview. Faça deploy depois de salvar as variáveis.

| Variável | Valor |
| --- | --- |
| `BRAWL_BACKEND_URL` | URL HTTPS base do serviço no Render |
| `BRAWL_SERVICE_TOKEN` | Mesmo valor usado no Render |
| `BRAWL_SITE_USER` | `brawl` |
| `BRAWL_SITE_PASSWORD` | Senha de `frontend/.env.production.local` |

O navegador pede usuário e senha ao abrir a Vercel. A chave da Supercell e a conexão do banco ficam no Render. O navegador consulta a API da Vercel na mesma origem, e a Vercel chama o Render com o token de serviço.

## Organização do código

- `frontend/src/app/` contém rotas, layout e handlers do Next.js. As telas ficam em `src/features/`, componentes compartilhados em `src/components/` e dados, catálogo e persistência local em `src/lib/`.
- `backend/app/main.py` inicializa o FastAPI. `app/routers/` define as rotas, `app/services/` contém a coleta e a análise, `app/repositories/` concentra a leitura do histórico e `app/jobs/` contém a execução agendada. O processo Web e o Cron Job compartilham os serviços Python.

## Recursos da interface

Os retratos, mapas e a meta histórica ficam em `frontend/assets/`. O comando `npm run build` ou `npm run dev` valida o pacote e reconstitui `frontend/public/` automaticamente.

## Contas e dados

Em **Contas e dados**, cadastre cada jogador pela tag. O painel mostra a tag até a primeira coleta bem-sucedida. A partir daí, usa o nome do perfil retornado pela Supercell. O seletor no topo troca a conta usada nas telas e lembra a seleção neste navegador. A tela mostra a última coleta, a partida mais recente recebida, atraso observado, falhas e histórico de atualizações da conta ativa. **Sincronizar agora** consulta apenas a conta selecionada. **Exportar histórico** baixa uma cópia.

A Supercell fornece uma janela de até 25 partidas recentes por consulta. O banco acumula as partidas novas conforme são coletadas. O histórico mostra todos os modos por padrão e pode ser filtrado para exibir só as partidas identificadas como Ranqueado. Análises de Ranqueado dependem das partidas e campos que a fonte fornece.

Em **Meta → Amostra de outros jogadores**, atualize até cinco históricos da classificação global da Supercell ou consulte uma tag pública específica. A coleta guarda as ranqueadas 3×3 completas em uma amostra independente das contas monitoradas. O painel calcula picks, win rate, confrontos e sinergias por mapa. A consulta manual alimenta as janelas Hoje e 7 dias. Os recortes por patch e temporada usam as partidas que a fila competitiva confirmou pelo Elo do perfil. O histórico padrão da API mostra os times finais. As taxas de ban exigem uma fonte com listas explícitas.

### Coleta recorrente da Meta

O coletor alimenta uma fila com até 200 tags por classificação de troféus e a expande com participantes das ranqueadas observadas. As classificações são definidas por `BRAWL_META_REGIONS`, que aceita `global` e códigos de países separados por vírgula. Confirma o Elo em cada perfil antes de consultar o histórico. O recorte **Alto nível · 7 dias** considera partidas completas observadas por jogadores com Elo igual ou superior a `BRAWL_META_MIN_ELO` (padrão `8250`). Esse Elo é o do perfil no momento da consulta. A tela mostra os perfis verificados, os qualificados, os que aguardam consulta e a última rodada.

**Windows.** Na raiz, com o ambiente de desenvolvimento preparado e a chave da Supercell cadastrada, execute:

```powershell
.\Agendar-Meta.ps1
```

O script registra a tarefa **Brawl Ranked Data - Meta**, solicita a primeira rodada e repete a cada **15 minutos**, com **20 perfis por rodada** e as classificações **global e Brasil**. A tarefa roda enquanto o Windows estiver ligado e seu usuário conectado, inclusive com o painel fechado. Execute o script novamente com `-IntervaloMinutos`, `-JogadoresPorRodada` ou `-Regioes` para ajustar a mesma tarefa.

```powershell
Get-ScheduledTaskInfo -TaskName 'Brawl Ranked Data - Meta'
Get-Content .\backend\.venv\meta-coleta.log -Tail 20
```

**Render.** Se preferir coletar com o computador desligado, use um Cron Job. Para executar apenas a Meta, use `python -m app.jobs.collect_meta`. Se o job já usa `python -m app.jobs.collect`, defina `BRAWL_META_COLLECT=1` para incluir a Meta na mesma execução. Configure `BRAWL_META_PLAYERS_PER_RUN=20` e `BRAWL_META_REGIONS=global,BR` para usar o mesmo volume do agendador Windows. Use o mesmo `BRAWL_META_MIN_ELO` no job e no Web Service se ajustar o corte. Para usar apenas o Render, desative a tarefa Windows com `Disable-ScheduledTask -TaskName 'Brawl Ranked Data - Meta'`.

Cada perfil elegível acrescenta uma consulta de histórico. As classificações são renovadas a cada seis horas e os HTTP 429 aplicam o intervalo de espera compartilhado.

Na **Visão geral**, expanda **Perfil e coleção de brawlers** para ver recordes, nível, vitórias, clube, troféus e equipamentos do perfil quando a API enviar esses campos. O detalhe de partida mostra craque e colocação de Combate quando presentes e conserva o JSON original para consulta.

Leituras manuais de rank, pontos e evidências continuam no navegador onde foram registradas. O histórico de outra origem, incluindo o antigo endereço `chatgpt.site`, fica onde foi registrado. A meta histórica permanece identificada por período e amostra. Se a Supercell retornar HTTP 429, a pausa vale para todas as contas que usam a mesma integração.

### Meta por patch e medição da coleta

A Meta abre no patch mais recente do catálogo. **Patch anterior** usa o mesmo corte de Elo observado no perfil. **Temporada** consolida os patches da janela cadastrada. A referência **Histórico 4–5/11** vem das séries decisivas do conjunto EliF77 e aparece com sua origem, período e unidade próprios. As tier lists usam a ordenação pelo limite inferior de Wilson, com pelo menos 30 resultados decisivos por brawler. Os tiers S, A, B e C correspondem a faixas relativas de posição no recorte.

O FastAPI e os jobs aplicam as migrações pendentes em `backend/app/migrations/` ao iniciar. A primeira cria `brawl_lab.ranked_patches`, `brawl_lab.ranked_seasons` e `brawl_lab.meta_collection_runs`. Para registrar um novo patch, crie uma migração SQL numerada com a data e a fonte. Use o mesmo instante UTC em `earliest_at` e `latest_at` se o horário efetivo for confirmado. Quando só a data em UTC for conhecida, use a meia-noite desse dia como limite inferior e a meia-noite seguinte como limite superior. A tier list do patch anterior termina antes do primeiro limite. A do novo patch começa no segundo limite, inclusive. Para confirmar um horário depois, crie outra migração que atualize os dois limites do registro. Novas temporadas precisam de datas próprias no catálogo.

Em **Meta → Amostra de outros jogadores**, confira o tamanho do banco, o tamanho das tabelas de partidas com índices e a última rodada manual ou agendada. As chamadas são tentativas do coletor competitivo, incluindo falhas. Compare partidas únicas recebidas e partidas novas para avaliar o rendimento. Uma leitura de perfil e uma de histórico contam separadamente.

Para medir uma rodada no Windows com a chave de desenvolvimento cadastrada, execute na raiz do projeto:

```powershell
Push-Location .\backend
.\.venv\Scripts\python.exe -m app.jobs.collect_meta --env-file .env.development.local --environment development --players-per-run 2 --regions global
Pop-Location
```

Se a fila estiver em pausa ou uma rodada estiver em andamento, aguarde a liberação. O modo manual da tela **Meta** também permite medir uma consulta de histórico usando uma tag pública. Confira os números antes de ativar ou aumentar a frequência do agendamento.

### Indicadores do DraftMeta

Em **Meta → DraftMeta**, selecione **Todos os mapas** ou um mapa e use **Atualizar do DraftMeta**. O FastAPI consulta a interface MCP pública, valida o recorte de todos os ranks contra o último patch e salva um snapshot por mapa e patch no PostgreSQL. Durante uma hora, a atualização reaproveita a cópia existente. A tela informa quando a cópia foi consultada. Se uma atualização falhar, a última cópia permanece disponível.

A primeira versão usa tier list, win rate, amostra por brawler e variações de win rate e presença após o patch. Presença é a proporção de partidas com o brawler. O painel usa as contagens consolidadas quando elas somam exatamente seis escolhas por partida. Quando a lista é parcial, usa as taxas publicadas em `map_info` que conferem com a tier list. O MCP ainda não oferece ban rate observado. O histórico pessoal continua vindo da Supercell. A aba **Coleta própria e histórico** permanece disponível para consulta e para o Draft Lab atual.

A comparação usa a conta selecionada, o mapa e a janela do snapshot. As datas publicadas são interpretadas em UTC e as partidas posteriores à consulta ficam fora do recorte. Mostra as amostras dos dois lados e a diferença em pontos percentuais a partir de 10 partidas decisivas da conta. O seletor de patch permite abrir snapshots já salvos.

**Bans observados nas minhas partidas** calcula taxas a partir de listas conhecidas, com filtro de mapa e cobertura. Uma lista explicitamente vazia entra no denominador e um campo ausente fica fora. Para acrescentar uma lista completa a uma partida antiga, use **Partidas → Registrar evidência**.

A migração `002_external_meta.sql` roda junto das demais na inicialização do backend. O teste manual da integração usa as configurações existentes, com saída HTTPS para `draftmeta.com`. Atualizações recorrentes em volume devem seguir os limites e condições da fonte. [Integração DraftMeta](https://draftmeta.com/ai) · [Termos do DraftMeta](https://draftmeta.com/terms)

### Atualização completa do DraftMeta

Na raiz do Windows, execute:

```powershell
.\Agendar-DraftMeta.ps1 -TestarAgora
.\Agendar-DraftMeta.ps1
Get-Content .\backend\.venv\draftmeta-coleta-development.log -Encoding UTF8 -Tail 20
```

A tarefa roda a cada 60 minutos, com o Windows ligado e seu usuário conectado. O job atualiza a tier list geral e consulta todos os mapas do pool ranqueado publicado pelo DraftMeta, com todos os ranks. O filtro de mapa é só para navegação. **Meta → DraftMeta** mostra a cobertura do patch, os mapas sem snapshot e os que ficaram com a cópia anterior. Um HTTP 429 interrompe a rodada e preserva os snapshots já salvos. O comando equivalente para um executor que já tenha `DATABASE_URL` configurado é `python -m app.jobs.collect_draftmeta`, a partir de `backend`.

### Draft Lab e Meta do patch

O Draft Lab abre com **DraftMeta** como fonte. A visão geral usa o último snapshot geral salvo para identificar o patch. Ao escolher um mapa, a tela consulta a cópia desse mapa no mesmo patch. As sugestões da tier list mostram win rate observado, presença quando disponível, partidas e data da leitura. Se o mapa ainda estiver sem snapshot nesse patch, a tela indica a lacuna.

Na aba **Picks**, com mapa definido e na vez da equipe azul, o FastAPI pede ao modelo do DraftMeta sugestões para a composição, os bans e a ordem do draft. A interface mostra a projeção após cada pick e após a resposta adversária indicada pelo modelo. A consulta usa todos os ranks do ranqueado solo e envia somente o cenário do draft. Picks ocupados ou banidos ficam fora, e o filtro de poder 11 também vale para as sugestões. Enquanto a projeção carrega ou está indisponível, a tela usa a tier list salva quando houver snapshot para o recorte.

**Bans** mostra sugestões baseadas na força dos brawlers no recorte. Para **counters**, o seletor permite usar a amostra própria, a referência histórica ou a sua conta, com a origem visível.

### Revisão por mapa e sessões

Em **Desempenho**, abra um mapa para ver suas últimas 10 partidas decisivas e as 10 anteriores, os brawlers usados e a comparação com o snapshot do DraftMeta. Os rankings dos mapas exigem 10 partidas decisivas. Para revisar, abra as fichas de vitória e derrota ou o detalhe de qualquer ranqueada. As observações vêm do replay assistido no jogo e ficam salvas por conta neste navegador. O plano da próxima sessão registra um ajuste e acompanha os resultados das partidas coletadas entre o início e a conclusão. A exportação do histórico inclui essas anotações.

Em **Progressão → Sessões do Ranqueado**, as partidas são agrupadas por temporada e dia de Brasília, com uma nova sessão após pelo menos uma hora de intervalo. Primeiro, último e pico de Elo são mostrados quando há leituras registradas no intervalo da sessão e na mesma temporada.

## Referências

- [Cron Jobs do Render](https://render.com/docs/cronjobs)
- [Deploy FastAPI no Render](https://render.com/docs/deploy-fastapi)
- [IPs de saída do Render](https://render.com/docs/outbound-ip-addresses)
- [Limitações do plano gratuito do Render](https://render.com/docs/free)
- [Conexão PostgreSQL no Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Variáveis de ambiente na Vercel](https://vercel.com/docs/environment-variables)
- [Portal da API do Brawl Stars](https://developer.brawlstars.com/)
