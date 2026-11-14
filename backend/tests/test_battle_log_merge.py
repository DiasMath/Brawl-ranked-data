import unittest

from app.domain import battle_kd, merge_battle_log, parse_battle


class BattleLogMergeTest(unittest.TestCase):
    def test_partial_recollection_keeps_known_match_details(self):
        owner = {"tag": "#PPPPPP", "brawler": {"id": 16000000, "name": "SHELLY"},
                 "statistics": {"kills": 2, "deaths": 0}}
        star = {"tag": owner["tag"], "name": "Craque"}
        old = {"battleTime": "20261114T030000.000Z", "event": {"id": 15001319, "map": "Hard Rock Mine"},
               "battle": {"type": "soloRanked", "mode": "gemGrab", "duration": 65, "result": "defeat",
                          "teams": [[owner, {"tag": "#QQQQQQ"}], [{"tag": "#RRRRRR"}]], "starPlayer": star}}
        new = {"battleTime": old["battleTime"], "event": {"mode": "gemGrab"},
               "battle": {"duration": None, "teams": [[{"tag": owner["tag"]}]],
                          "starPlayer": {"tag": None, "name": None}}}

        merged = merge_battle_log(old, new)
        parsed = parse_battle(merged, owner["tag"])
        self.assertEqual(parsed["id"], parse_battle(old, owner["tag"])["id"])
        self.assertTrue(parsed["ranked"])
        self.assertEqual((parsed["duration_seconds"], parsed["map_name"], parsed["result"]),
                         (65, "Hard Rock Mine", "defeat"))
        self.assertEqual([player[-1] for player in parsed["players"]], ["self", "ally", "opponent"])
        self.assertEqual(merged["battle"]["starPlayer"], star)
        self.assertEqual(battle_kd(merged["battle"], owner["tag"]), {"kills": 2, "deaths": 0, "reference": None})

    def test_reordered_teams_keep_player_fields_by_tag(self):
        a = {"tag": "#PPPPPP", "brawler": {"id": 16000000, "name": "SHELLY"}}
        b = {"tag": "#QQQQQQ", "brawler": {"id": 16000001, "name": "COLT"}}
        old = {"battle": {"teams": [[a], [b]], "starPlayer": {"tag": a["tag"], "name": "Antigo"}}}
        new_star = {"tag": b["tag"], "name": "Novo"}
        new = {"battle": {"teams": [[{"tag": b["tag"]}], [{"tag": a["tag"]}]], "starPlayer": new_star}}
        merged = merge_battle_log(old, new)
        self.assertEqual(merged["battle"]["teams"], [[b], [a]])
        self.assertEqual(merged["battle"]["starPlayer"], new_star)
