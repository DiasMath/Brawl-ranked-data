# Brawl Ranked Data

Painel privado do Ranqueado de Brawl Stars. A Vercel hospeda o Next.js, o Render executa o FastAPI e o PostgreSQL conserva o histórico.

## Estrutura

| Pasta ou arquivo | Uso |
| --- | --- |
| `frontend/` | Next.js App Router, autenticação de acesso e conexão privada com o backend |
| `backend/` | FastAPI, coleta oficial, esquema PostgreSQL e histórico persistente |
| `render.yaml` | Blueprint opcional para a API do Render |
| `render.cron.yaml` | Blueprint opcional para criar o Cron Job pago separadamente |
| `Preparar-Ambiente.ps1` | Gera as credenciais próprias do painel e preenche os arquivos locais de ambiente |

## Preparar no Windows

Extraia o ZIP em `D:\PROJETOS\BRAWL RANKED DATA` e abra o PowerShell nessa pasta. Execute:

```powershell
.\Preparar-Ambiente.ps1
```

Se recebeu os dois arquivos de ambiente preenchidos, copie-os para as pastas correspondentes e pule o script.

O script cria `frontend/.env.local` e `backend/.env`. O token de serviço tem o mesmo valor nos dois arquivos. A senha de acesso ao painel fica somente no frontend. Você pode preencher a chave oficial e a URL do banco depois. Os arquivos de ambiente preenchidos ficam fora do Git.

## 1. PostgreSQL

Crie um banco persistente no Supabase ou no Render. Use a URL de conexão do PostgreSQL como `DATABASE_URL` no backend. Se usar Supabase com conexão IPv4, abra **Connect** e copie a URL do **Session pooler** (porta 5432). Na produção, use uma conexão TLS. Para o Supabase, inclua `sslmode=require` na URL. A API e o coletor criam o esquema `brawl_lab` no primeiro início. O usuário do banco precisa ter permissão para criá-lo.

## 2. Render Web Service e Cron Job

Envie as duas pastas a um repositório privado e conecte o repositório ao Render. Crie um **Web Service** com runtime **Python**. O Web Service atende o painel e a sincronização manual. Um Cron Job separado consulta a API da Supercell e grava no PostgreSQL, mesmo com o Web Service em repouso. O plano gratuito da API pode demorar para responder após inatividade. O Cron Job tem cobrança mínima de US$ 1 por mês.

| Campo | Valor |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health Check Path | `/health` |

| Variável | Valor |
| --- | --- |
| `PYTHON_VERSION` | `3.12.12` |
| `BRAWL_PLAYER_TAG` | Sua tag de jogador, com ou sem `#` |
| `BRAWL_COLLECTION_INTERVAL_SECONDS` | `300` para exibir o intervalo no painel |
| `BRAWL_SERVICE_TOKEN` | Valor gerado em `backend/.env` |
| `DATABASE_URL` | URL do banco com suas credenciais |
| `BRAWL_API_TOKEN` | Chave da Supercell autorizada para a saída do Render |

### Coleta agendada

Crie um **Cron Job** no mesmo repositório. Use a mesma `DATABASE_URL`, `BRAWL_PLAYER_TAG` e `BRAWL_API_TOKEN` no Cron Job e no Web Service. O token `BRAWL_SERVICE_TOKEN` é usado somente na Vercel e no Web Service.

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

## 3. Vercel

Crie um projeto Next.js no mesmo repositório com **Root Directory** em `frontend`. Use as configurações de build padrão do Next.js. Cadastre as variáveis abaixo em **Settings → Environment Variables** para Production e, se desejar, Preview. Faça deploy depois de salvar as variáveis.

| Variável | Valor |
| --- | --- |
| `BRAWL_BACKEND_URL` | URL HTTPS base do serviço no Render |
| `BRAWL_SERVICE_TOKEN` | Mesmo valor usado no Render |
| `BRAWL_SITE_USER` | `brawl` |
| `BRAWL_SITE_PASSWORD` | Senha gerada em `frontend/.env.local` |

O navegador pede usuário e senha ao abrir a Vercel. A chave da Supercell e a conexão do banco ficam no Render. O navegador consulta a API da Vercel na mesma origem, e a Vercel chama o Render com o token de serviço.

## Rodar localmente

Abra dois terminais na raiz. Use as credenciais geradas e uma URL PostgreSQL acessível.

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8787
```

```powershell
cd frontend
npm ci
npm run dev
```

Abra `http://localhost:3000` e use o usuário e a senha de `frontend/.env.local`.

## Organização do código

- `frontend/src/app/` contém rotas, layout e handlers do Next.js. As telas ficam em `src/features/`, componentes compartilhados em `src/components/` e dados, catálogo e persistência local em `src/lib/`.
- `backend/app/main.py` inicializa o FastAPI. `app/routers/` define as rotas, `app/services/` contém a coleta e a análise, `app/repositories/` concentra a leitura do histórico e `app/jobs/` contém a execução agendada. O processo Web e o Cron Job compartilham os serviços Python.
- Para executar a coleta uma vez no Windows a partir de `backend/`, rode `.\.venv\Scripts\python.exe -m dotenv -f .env run -- .\.venv\Scripts\python.exe -m app.jobs.collect`. As credenciais vêm do mesmo `.env` local.

## Recursos da interface

Os retratos, mapas e a meta histórica ficam em `frontend/assets/`. O comando `npm run build` ou `npm run dev` valida o pacote e reconstitui `frontend/public/` automaticamente.

## Contas e dados

A tela mostra a tag configurada no Render, o horário da última coleta, a partida mais recente recebida, atraso observado, falhas e histórico de atualizações. **Sincronizar agora** consulta a Supercell. **Exportar histórico** baixa uma cópia. A primeira coleta parte da janela recente da API e acumula as partidas recebidas daí em diante.

Leituras manuais de rank, pontos e evidências continuam no navegador onde foram registradas. O histórico de outra origem, incluindo o antigo endereço `chatgpt.site`, fica onde foi registrado. A meta histórica permanece identificada por período e amostra. A coleta hospedada deste pacote acompanha a conta configurada.

## Referências

- [Cron Jobs do Render](https://render.com/docs/cronjobs)
- [Deploy FastAPI no Render](https://render.com/docs/deploy-fastapi)
- [IPs de saída do Render](https://render.com/docs/outbound-ip-addresses)
- [Limitações do plano gratuito do Render](https://render.com/docs/free)
- [Conexão PostgreSQL no Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Variáveis de ambiente na Vercel](https://vercel.com/docs/environment-variables)
- [Portal da API do Brawl Stars](https://developer.brawlstars.com/)
