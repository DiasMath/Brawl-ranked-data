from contextlib import contextmanager
from datetime import date
from urllib.parse import urlparse

import httpx

from .supercell import CollectionError


ENDPOINT = "https://draftmeta.com/api/mcp"
PROTOCOL = "2025-03-26"


class DraftMetaClient:
    def __init__(self, client):
        self.client = client
        self.headers = {"Accept": "application/json, text/event-stream"}
        self.request_id = 0

    def send(self, method, params=None, *, notification=False):
        message = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            message["params"] = params
        if not notification:
            self.request_id += 1
            message["id"] = self.request_id
        response = self.client.post(ENDPOINT, headers=self.headers, json=message)
        response.raise_for_status()
        if notification:
            return None
        data = response.json()
        if data.get("id") != self.request_id or "error" in data:
            raise ValueError("Resposta RPC inválida")
        if method == "initialize" and response.headers.get("Mcp-Session-Id"):
            self.headers["Mcp-Session-Id"] = response.headers["Mcp-Session-Id"]
        return data["result"]

    def initialize(self):
        result = self.send("initialize", {
            "protocolVersion": PROTOCOL, "capabilities": {},
            "clientInfo": {"name": "Brawl Ranked Data", "version": "0.1.0"},
        })
        if result["protocolVersion"] != PROTOCOL:
            raise ValueError("Versão MCP incompatível")
        self.headers["MCP-Protocol-Version"] = PROTOCOL
        self.send("notifications/initialized", notification=True)

    def call(self, name, **arguments):
        result = self.send("tools/call", {"name": name, "arguments": arguments})
        if result.get("isError") or not isinstance(result.get("structuredContent"), dict):
            raise ValueError("Dados estruturados indisponíveis")
        return result["structuredContent"]


def source_link(value):
    url = urlparse(value)
    if url.scheme != "https" or url.netloc != "draftmeta.com" or not url.path.startswith("/games/brawl-stars/"):
        raise ValueError("Link da fonte inválido")
    return value


def rate(value, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= 100:
        raise ValueError("Taxa inválida")
    return value


def positive_count(value):
    if type(value) is not int or value < 1:
        raise ValueError("Amostra inválida")
    return value


def brawler_row(row):
    if not isinstance(row["name"], str) or not row["name"].strip():
        raise ValueError("Brawler inválido")
    return {"name": row["name"], "win_rate": rate(row["winRate"]), "games": positive_count(row["games"])}


def patch_window(window):
    start, end = date.fromisoformat(window["from"]), date.fromisoformat(window["to"])
    if start > end:
        raise ValueError("Intervalo inválido")
    return {"start": start.isoformat(), "end": end.isoformat(), "battles": positive_count(window["battles"])}


def format_snapshot(tier_list, changes, map_name=None, map_info=None):
    current = patch_window(changes["window"]["current"])
    previous = patch_window(changes["window"]["previous"])
    patch_date = date.fromisoformat(changes["updatesWithData"][0]["id"]).isoformat()
    expected = f"All ranks, drafted Ranked, since the {patch_date} update"
    if tier_list["population"] != expected or previous["end"] >= patch_date or current["start"] < patch_date:
        raise ValueError("Janelas incompatíveis entre as consultas")
    battles = positive_count(tier_list["battles"])
    expected_scope = tier_list["scope"].startswith(f"{map_name} (") if map_name else tier_list["scope"] == "all modes"
    if not expected_scope:
        raise ValueError("Mapa retornado é diferente do solicitado")
    tiers = []
    seen = set()
    for tier in tier_list["tiers"]:
        label = tier["tier"]
        if label not in ("S", "A", "B", "C", "D") or label in seen:
            raise ValueError("Tier inválido")
        seen.add(label)
        tiers.append({"tier": label, "brawlers": [brawler_row(row) for row in tier["brawlers"]]})
    rows = [row for tier in tiers for row in tier["brawlers"]]
    if not rows or len({row["name"].casefold() for row in rows}) != len(rows):
        raise ValueError("Tier list vazia ou duplicada")
    if any(row["games"] > battles for row in rows):
        raise ValueError("Amostra de brawler excede o recorte")
    picks = []
    if map_info and map_info["map"] == map_name:
        ranked = {row["name"]: row for tier in tiers for row in tier["brawlers"]}
        for row in map_info.get("bestAllRanks", []):
            parsed = brawler_row(row)
            presence = rate(row["pickRate"])
            if parsed == ranked.get(parsed["name"]) and abs(100 * parsed["games"] / battles - presence) <= 0.06:
                picks.append({"name": parsed["name"], "pick_rate": presence})
    # DraftMeta counts presence per match. Use the published counts only when the
    # tier response reconciles to all six choices in every drafted match.
    presence = ([{"name": row["name"], "pick_rate": 100 * row["games"] / battles} for row in rows]
                if sum(row["games"] for row in rows) == 6 * battles else None)
    movements = None
    if not map_name:
        movements = {"current": current, "previous": previous, "source_url": source_link(changes["link"])}
        for target, key in (("win_risers", "winRisers"), ("win_fallers", "winFallers"),
                            ("pick_risers", "pickRisers"), ("pick_fallers", "pickFallers")):
            movements[target] = [{"name": row["brawler"], "win_change": rate(row["winChange"], -100),
                                  "pick_change": rate(row["appearanceChange"], -100),
                                  "games": positive_count(row["games"])} for row in changes[key]]
    return {"provider": "DraftMeta", "patch_date": patch_date, "map": map_name, "source_url": source_link(tier_list["link"]),
            "start": current["start"], "end": current["end"], "battles": battles, "tiers": tiers,
            "map_picks": picks, "presence": presence, "movements": movements}


@contextmanager
def draftmeta_session():
    try:
        with httpx.Client(timeout=9, follow_redirects=False) as http:
            client = DraftMetaClient(http)
            client.initialize()
            yield client
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 429:
            raise CollectionError(429, "Limite de consultas ao DraftMeta atingido. Tente novamente mais tarde.") from error
        raise CollectionError(502, "O DraftMeta está temporariamente indisponível.") from error
    except httpx.RequestError as error:
        raise CollectionError(502, "O DraftMeta está temporariamente indisponível.") from error
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        raise CollectionError(502, "O DraftMeta ainda não publicou amostras compatíveis para este recorte.") from error


def read_tier(client, changes, map_name=None, *, include_map_info=False):
    arguments = {"rank": "all", "per_tier": 30}
    if map_name:
        arguments["map"] = map_name
    tier = client.call("tier_list", **arguments)
    snapshot = format_snapshot(tier, changes, map_name)
    if map_name and include_map_info and snapshot["presence"] is None:
        map_info = client.call("map_info", map=map_name, limit=15)
        snapshot = format_snapshot(tier, changes, map_name, map_info)
    return snapshot


def ranked_pool(client):
    rows = client.call("current_rotation")["rankedPool"]
    names = list(dict.fromkeys(row["map"].strip() for row in rows))
    if not names or any(not name or len(name)>100 for name in names):
        raise ValueError("Catálogo ranqueado inválido")
    return names


def fetch_snapshot(map_name=None):
    with draftmeta_session() as client:
        changes = client.call("meta_changes", update="latest")
        return read_tier(client, changes, map_name, include_map_info=True)
