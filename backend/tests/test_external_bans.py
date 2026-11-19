from contextlib import nullcontext
from copy import deepcopy
import unittest
from unittest.mock import Mock, patch

from app.services.external_bans import format_bans
from app.services.draftmeta import fetch_draft_suggestions


def source_data(map_name="Test map", rank="masters"):
    scope = {"btype": "soloRanked", "map": map_name, "mode": None,
             "rank": ["masters-plus"] if rank == "masters" else [], "from": "20261112", "to": "20261119"}
    row = {"name": "Colt", "banned": 5, "bothTeams": 2, "games": 4, "wins": 2,
           "banRate": .5, "pickRate": .4, "winRate": .55}
    return {"scope": scope, "drafts": 10, "battles": 10, "brawlers": [row]}, \
           {"scope": scope, "drafts": 10, "bans": [{"name": "Colt", "threat": .002}]}


class ExternalBansTest(unittest.TestCase):
    def parse(self, data, best):
        return format_bans(data, best, "Test map", "masters", "2026-11-11", "2026-11-12", "2026-11-19")

    def test_published_and_raw_win_rates_remain_distinct_and_double_bans_count_once(self):
        parsed = self.parse(*source_data())
        row = parsed["rows"][0]
        self.assertEqual(row["ban_rate"], .5)
        self.assertEqual(row["banned"], 5)
        self.assertEqual(row["win_rate"], .55)
        self.assertEqual(row["raw_win_rate"], .5)
        self.assertEqual(parsed["rank_method"], "lobby_average")

    def test_wrong_scope_invalid_counts_rates_and_duplicate_brawlers_are_rejected(self):
        for mutate in (lambda d: d["scope"].update(map="Other map"),
                       lambda d: d["scope"].update(rank=[]), lambda d: d["scope"].update(to="20261118"),
                       lambda d: d["brawlers"][0].update(banned=11), lambda d: d["brawlers"][0].update(banRate=.9),
                       lambda d: d["brawlers"][0].update(pickRate=float("nan")),
                       lambda d: d["brawlers"].append(deepcopy(d["brawlers"][0]))):
            data, best = deepcopy(source_data())
            mutate(data)
            with self.assertRaises(ValueError):
                self.parse(data, best)

    def test_unknown_win_rate_with_zero_games_is_not_a_zero_percent_loss_rate(self):
        data, best = source_data()
        data["brawlers"][0].update(games=0, wins=0, pickRate=0, winRate=None)
        row = self.parse(data, best)["rows"][0]
        self.assertIsNone(row["win_rate"])
        self.assertIsNone(row["raw_win_rate"])

    def test_ban_coverage_and_pick_presence_use_their_own_denominators(self):
        data, best = source_data()
        data["battles"] = 20
        data["brawlers"][0]["pickRate"] = .2
        parsed = self.parse(data, best)
        self.assertEqual(parsed["battles"], 20)
        self.assertEqual(parsed["drafts"], 10)
        self.assertEqual(parsed["rows"][0]["ban_rate"], .5)
        self.assertEqual(parsed["rows"][0]["pick_rate"], .2)

    def test_draft_returns_actual_rank_scope_when_provider_falls_back(self):
        client = Mock()
        client.call.return_value = {"map": "Test map", "toMove": "us", "pickNumber": 1,
                                    "population": "soloRanked", "band": "all", "suggestions": [],
                                    "ourWinChanceNow": 50, "link": "https://draftmeta.com/games/brawl-stars/drafter"}
        with patch("app.services.draftmeta.draftmeta_session", return_value=nullcontext(client)):
            result = fetch_draft_suggestions("Test map", [], [], [], True, rank="masters")
        self.assertEqual(client.call.call_args.kwargs["rank"], "masters")
        self.assertEqual(result["rank_scope"], "all")
        self.assertFalse(result["rank_honored"])
