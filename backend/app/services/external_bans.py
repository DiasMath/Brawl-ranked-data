"""Read the complete public table used by DraftMeta's Ranked bans page."""
from datetime import date, datetime
import math
from urllib.parse import urlencode

from .draftmeta import source_link


ENDPOINT = "https://draftmeta.com/api/brawl-stars/battle-stats"
SOURCE = "https://draftmeta.com/games/brawl-stars/ranked/bans"


def count(value):
    if type(value) is not int or value < 0:
        raise ValueError("Contagem de bans inválida")
    return value


def fraction(value):
    if type(value) not in (float, int) or not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError("Taxa de bans inválida")
    return value


def day(value):
    return datetime.strptime(value, "%Y%m%d").date().isoformat()


def verify_scope(data, map_name, rank, start, end):
    scope = data["scope"]
    expected_rank = ["masters-plus"] if rank == "masters" else []
    if (scope["btype"] != "soloRanked" or (scope.get("map") or "") != (map_name or "")
            or scope.get("mode") is not None or (scope.get("rank") or []) != expected_rank
            or day(scope["from"]) != start or day(scope["to"]) != end):
        raise ValueError("Recorte de bans diferente do solicitado")


def format_bans(data, best, map_name, rank, patch_date, start, end):
    verify_scope(data, map_name, rank, start, end)
    verify_scope(best, map_name, rank, start, end)
    drafts = count(data["drafts"])
    battles = count(data["battles"])
    if drafts > battles:
        raise ValueError("Cobertura de bans excede o total de partidas")
    recommendations_drafts = count(best["drafts"])
    rows, names = [], set()
    for row in data["brawlers"]:
        name = row["name"].strip()
        if not name or name.casefold() in names:
            raise ValueError("Brawler de bans vazio ou duplicado")
        names.add(name.casefold())
        banned, games, wins, both = (count(row[field]) for field in ("banned", "games", "wins", "bothTeams"))
        ban_rate = fraction(row["banRate"]) if drafts else None
        pick_rate = fraction(row["pickRate"]) if battles else None
        win_rate = fraction(row["winRate"]) if games and row["winRate"] is not None else None
        if banned > drafts or games > battles or both > banned or wins > games:
            raise ValueError("Contagens de bans incompatíveis com a amostra")
        for rate, numerator, denominator in ((ban_rate, banned, drafts), (pick_rate, games, battles)):
            if (denominator and abs(rate - numerator / denominator) > .00011) or (not denominator and numerator):
                raise ValueError("Taxa não confere com as contagens publicadas")
        rows.append({"name": name, "banned": banned, "games": games, "wins": wins, "both_teams": both,
                     "ban_rate": ban_rate if drafts else None, "pick_rate": pick_rate if battles else None,
                     "win_rate": win_rate if games else None, "raw_win_rate": wins / games if games else None})
    if drafts and not rows:
        raise ValueError("Tabela de bans ausente")
    recommendations = []
    seen = set()
    for row in best["bans"]:
        name = row["name"].strip()
        if name.casefold() not in names or name.casefold() in seen:
            raise ValueError("Sugestão de ban incompatível com o catálogo")
        seen.add(name.casefold())
        recommendations.append({"name": name, "score": fraction(row["threat"])})
    return {"provider": "DraftMeta", "map": map_name or None, "rank": rank, "rank_method": "lobby_average",
            "patch_date": patch_date, "start": start, "end": end, "drafts": drafts, "battles": battles, "rows": rows,
            "recommendations": sorted(recommendations, key=lambda row: -row["score"]),
            "recommendation_drafts": recommendations_drafts, "source_url": source_link(SOURCE)}


def read_bans(client, changes, map_name=None, *, rank="masters"):
    current = changes["window"]["current"]
    start, end = (date.fromisoformat(current[key]).isoformat() for key in ("from", "to"))
    patch = date.fromisoformat(changes["updatesWithData"][0]["id"]).isoformat()
    params = {"from": start.replace("-", ""), "to": end.replace("-", "")}
    if rank == "masters":
        params["rank"] = "masters-plus"
    if map_name:
        params["map"] = map_name
    results = []
    for endpoint in ("bans", "best-bans"):
        response = client.client.get(ENDPOINT, params={**params, "endpoint": endpoint})
        response.raise_for_status()
        payload = response.json()
        if payload.get("ok") is not True or not isinstance(payload.get("data"), dict):
            raise ValueError("Tabela pública de bans indisponível")
        results.append(payload["data"])
    result = format_bans(*results, map_name, rank, patch, start, end)
    result["source_url"] += "?" + urlencode({"rank": params.get("rank", ""), "map": map_name or ""})
    return result
