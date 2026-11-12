from email.utils import parsedate_to_datetime
from ipaddress import IPv4Address
import re

import httpx

from ..domain import utc_now


class CollectionError(Exception):
    def __init__(self, status_code: int, detail: str, headers: dict[str, str] | None = None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.headers = headers


def official_client(key):
    return httpx.Client(
        base_url="https://api.brawlstars.com/v1/", timeout=15,
        headers={"Authorization": f"Bearer {key}"}, follow_redirects=False,
    )


def reported_ipv4(error):
    message = error.get("message")
    if not isinstance(message, str):
        return None
    for candidate in re.findall(r"(?<![\d.])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![\d.])", message[:500]):
        try:
            return str(IPv4Address(candidate))
        except ValueError:
            continue
    return None


def retry_seconds(value):
    if value.isdecimal() and len(value) < 8:
        return max(60, int(value))
    try:
        return max(60, int((parsedate_to_datetime(value).replace(tzinfo=None) - utc_now()).total_seconds()))
    except (TypeError, ValueError, OverflowError):
        return 600


def fetch(client, path):
    try:
        response = client.get(path)
    except httpx.RequestError as exc:
        raise CollectionError(502, "Falha de conexão com a API oficial.") from exc
    if response.status_code == 403:
        try:
            error = response.json()
        except ValueError:
            error = None
        if isinstance(error, dict) and error.get("reason") == "accessDenied.invalidIp":
            address = reported_ipv4(error)
            seen = f" IPv4 informado pela Supercell: {address}." if address else ""
            raise CollectionError(403, "A Supercell recusou o IP de saída do servidor."
                                  + seen + " Confira os endereços autorizados na chave de API.")
        raise CollectionError(403, "A Supercell negou o acesso (HTTP 403). "
                              "Confira a chave cadastrada e os IPs autorizados.")
    if response.status_code == 404:
        raise CollectionError(404, "Conta não encontrada na API oficial.")
    if response.status_code == 429:
        raise CollectionError(429, "Limite da API atingido. Aguarde antes de atualizar novamente.",
                            headers={"Retry-After": str(retry_seconds(response.headers.get("Retry-After", "")))})
    if response.status_code != 200:
        raise CollectionError(502, f"A API oficial retornou HTTP {response.status_code}.")
    try:
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError()
        return payload
    except ValueError as exc:
        raise CollectionError(502, "Formato inesperado na resposta da Supercell.") from exc
