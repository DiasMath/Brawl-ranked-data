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
| `Preparar-Ambiente.ps1` | Gera as credenciais próprias do painel e preenche os arquivos locais de ambiente |
| `Iniciar-Backend.ps1` | Executa o FastAPI no Windows com o arquivo do ambiente selecionado |

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

Informe a chave de dev e a URL do banco escolhido. O script cria `frontend/.env.development.local` e `backend/.env.development.local`, gera um token de serviço compartilhado e uma senha para o painel local. Se já recebeu os arquivos de dev, coloque cada um na pasta indicada e preencha `DATABASE_URL` e `BRAWL_API_TOKEN` no arquivo do backend. Os arquivos preenchidos ficam fora do Git. Sem a chave, o painel abre e aceita cadastros. Preencha a chave e reinicie o FastAPI para sincronizar.

### Iniciar o painel

Abra dois terminais na raiz. A criação do ambiente virtual e a instalação dos pacotes são necessárias na primeira execução ou quando as dependências mudarem.

**Terminal 1 · FastAPI**

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
.\Iniciar-Backend.ps1
```

**Terminal 2 · Next.js**

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev -- --hostname 127.0.0.1
```

Abra `http://127.0.0.1:3000` e entre com `BRAWL_SITE_USER` e `BRAWL_SITE_PASSWORD` de `frontend/.env.development.local`. Em **Contas e dados**, adicione cada jogador pela tag e clique em **Sincronizar agora**. Se precisar confirmar que o FastAPI subiu, acesse `http://127.0.0.1:8787/health`.

O ambiente local começa em modo manual. Para coletar todas as contas de uma vez, execute a partir de `backend/`:

```powershell
.\.venv\Scripts\python.exe -m dotenv -f .env.development.local run -- .\.venv\Scripts\python.exe -m app.jobs.collect
```

Esse comando também pode ser agendado pelo Agendador de Tarefas do Windows enquanto a máquina estiver ligada. Nesse caso, ajuste `BRAWL_COLLECTION_INTERVAL_SECONDS` para o intervalo programado e reinicie o FastAPI.

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
| `BRAWL_API_TOKEN` | Chave da Supercell autorizada para a saída do Render |

#### Coleta agendada opcional no Render

Crie um **Cron Job** no mesmo repositório. Use a mesma `DATABASE_URL` no Cron Job e no Web Service. O cron lê desse banco a lista de jogadores cadastrados em **Contas e dados**. Configure a chave `BRAWL_API_TOKEN` em cada serviço com autorização para a saída correspondente. O token `BRAWL_SERVICE_TOKEN` é usado somente na Vercel e no Web Service.

| Campo | Valor |
| --- | --- |
| Runtime | Python |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements-collector.txt` |
| Command | `python -m app.jobs.collect` |
| Schedule | `*/5 * * * *` (UTC) |
| `PYTHON_VERSION` | `3.12.12` |

Se a API já existe, crie somente o Cron Job. O comando antigo da API ainda funciona. Para uma instalação nova, use `render.yaml` para a API e selecione `render.cron.yaml` como caminho do Blueprint quando quiser criar o Cron Job. A antiga variável `BRAWL_POLL_SECONDS` pode ser removida do Web Service. A frequência real é configurada no agendamento do Cron Job.

Em **Connect → Outbound**, confira os endereços de saída de ambos os serviços. Autorize os endereços aceitos pelo portal da Supercell na chave configurada. A API pode subir antes da chave para você consultar os IPs. Depois de configurá-la, use **Runs → Trigger Run** no Cron Job e confirme a última coleta em **Contas e dados**. A coleta agendada e o botão manual compartilham o bloqueio no banco e respeitam o intervalo de espera após HTTP 429.

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

Em **Contas e dados**, cadastre cada jogador pela tag. O painel mostra a tag até a primeira coleta bem-sucedida. A partir daí, usa o nome do perfil retornado pela Supercell. O seletor no topo troca a conta usada nas telas e lembra a seleção neste navegador. A tela mostra a última coleta, a partida mais recente recebida, atraso observado, falhas e histórico de atualizações da conta ativa. **Sincronizar agora** consulta a Supercell. **Exportar histórico** baixa uma cópia. A primeira coleta parte da janela recente da API e acumula as partidas recebidas daí em diante.

Leituras manuais de rank, pontos e evidências continuam no navegador onde foram registradas. O histórico de outra origem, incluindo o antigo endereço `chatgpt.site`, fica onde foi registrado. A meta histórica permanece identificada por período e amostra. A coleta agendada percorre todas as contas cadastradas. Se a Supercell retornar HTTP 429, a pausa vale para todas as contas que usam a mesma integração.

## Referências

- [Cron Jobs do Render](https://render.com/docs/cronjobs)
- [Deploy FastAPI no Render](https://render.com/docs/deploy-fastapi)
- [IPs de saída do Render](https://render.com/docs/outbound-ip-addresses)
- [Limitações do plano gratuito do Render](https://render.com/docs/free)
- [Conexão PostgreSQL no Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Variáveis de ambiente na Vercel](https://vercel.com/docs/environment-variables)
- [Portal da API do Brawl Stars](https://developer.brawlstars.com/)
