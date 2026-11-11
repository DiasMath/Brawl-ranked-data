param([string]$RenderUrl = 'http://127.0.0.1:8787', [string]$PlayerTag = '')
$ErrorActionPreference = 'Stop'
$front = Join-Path $PSScriptRoot 'frontend/.env.local'
$back = Join-Path $PSScriptRoot 'backend/.env'
if ((Test-Path -LiteralPath $front) -or (Test-Path -LiteralPath $back)) {
    throw 'Já existe um arquivo de ambiente. Edite os arquivos existentes para manter as credenciais.'
}
$parsed = $null
if (!( [Uri]::TryCreate($RenderUrl, [UriKind]::Absolute, [ref]$parsed) ) -or
    ($parsed.Scheme -ne 'https' -and !($parsed.IsLoopback -and $parsed.Scheme -eq 'http')) -or
    $parsed.UserInfo -or $parsed.Query -or $parsed.Fragment -or $parsed.AbsolutePath -ne '/') {
    throw 'Informe a URL base HTTPS do Render ou o endereço local.'
}
function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
function Read-SecretValue([string]$Prompt) {
    $secret = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
if (!$PlayerTag) { $PlayerTag = Read-Host 'Tag do jogador' }
$PlayerTag = $PlayerTag.Trim().TrimStart('#').ToUpperInvariant()
if ($PlayerTag -notmatch '^[0289PYLQGRJCUV]{3,16}$') { throw 'Tag inválida.' }
$token = Read-SecretValue 'Chave da Supercell (Enter para preencher depois)'
$database = Read-SecretValue 'DATABASE_URL do PostgreSQL (Enter para preencher depois)'
if ($token -match '[\r\n]' -or $database -match '[\r\n]') { throw 'Informe valores de uma linha.' }
$shared = New-RandomSecret
$password = New-RandomSecret
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllLines($front, @(
    "BRAWL_BACKEND_URL=$RenderUrl", 'BRAWL_SITE_USER=brawl',
    "BRAWL_SITE_PASSWORD=$password", "BRAWL_SERVICE_TOKEN=$shared"
), $utf8)
[IO.File]::WriteAllLines($back, @(
    'PYTHON_VERSION=3.12.12', "BRAWL_PLAYER_TAG=$PlayerTag", 'BRAWL_POLL_SECONDS=300',
    "BRAWL_SERVICE_TOKEN=$shared", "BRAWL_API_TOKEN=$token", "DATABASE_URL=$database"
), $utf8)
Write-Host 'Arquivos frontend/.env.local e backend/.env gerados. Use os valores nos painéis da Vercel e do Render.'
