import os
import unittest
from datetime import datetime
from unittest.mock import Mock, patch

import psycopg

from app.db import database, prepare_collection
from app.repositories.competitive import collection_diagnostics, record_collection
from app.services.meta_sample import sample_report, save_sample
from app.services.supercell import CountedCompetitiveClient


@unittest.skipUnless(os.getenv("BRAWL_TEST_DATABASE_URL"), "Use a disposable PostgreSQL database")
class CompetitivePeriodsTest(unittest.TestCase):
    def test_migration_patch_boundaries_and_diagnostics(self):
        test_url = os.environ["BRAWL_TEST_DATABASE_URL"]
        with psycopg.connect(test_url) as connection:
            self.assertIsNone(connection.execute("SELECT to_regnamespace('brawl_lab')").fetchone()[0],
                              "The disposable database must start without the brawl_lab schema")
        with patch.dict(os.environ, DATABASE_URL=test_url, BRAWL_PLAYER_TAG="", BRAWL_META_MIN_ELO="8250"):
            prepare_collection()
            with database() as (_, cursor):
                cursor.execute("""
                    UPDATE ranked_patches SET earliest_at='2026-11-03 08:00:00', latest_at='2026-11-03 08:00:00'
                    WHERE id='2026-11-03'
                """)
                dates = ("2026-11-03T07:59:59.999", "2026-11-03T08:00:00", "2026-11-10T23:59:59.999",
                         "2026-11-11T00:00:00", "2026-11-11T23:59:59.999", "2026-11-12T00:00:00")
                batches = {str(i): (str(i), datetime.fromisoformat(played), "Test map", "gemGrab",
                                    [1, 2, 3], [4, 5, 6], 0) for i, played in enumerate(dates)}
                self.assertEqual(save_sample(cursor, batches, 9000), 6)
                self.assertEqual(save_sample(cursor, batches, 9000), 0)
                client = CountedCompetitiveClient(Mock())
                for path in ("rankings/global/players", "players/test", "players/test/battlelog"):
                    client.get(path)
                record_collection(cursor, "scheduled", client, 6, 6, "ok")
            prepare_collection()
            with database() as (_, cursor), patch("app.services.meta_sample.utc_now", return_value=datetime(2026, 11, 13)):
                windows = sample_report(cursor)["windows"]
                current = windows["patch"]
                previous = windows["previous_patch"]
                self.assertEqual(current["contexts"][0]["sets"], 1)
                self.assertEqual(previous["contexts"][0]["sets"], 2)
                self.assertEqual(windows["season"]["contexts"][0]["sets"], 6)
                self.assertTrue(current["date_only"])
                self.assertFalse(previous["date_only"])
                self.assertEqual(previous["start_at"], "2026-11-03T08:00:00.000Z")
                self.assertEqual(previous["end_at"], "2026-11-11T00:00:00.000Z")
                diagnostics = collection_diagnostics(cursor)
                self.assertGreater(diagnostics["sample_bytes"], 0)
                self.assertEqual(diagnostics["sample_records"], 6)
                run = diagnostics["last_run"]
                self.assertEqual([run[key] for key in ("profile_requests", "battlelog_requests", "ranking_requests", "added")], [1, 1, 1, 6])
                cursor.execute("SELECT COUNT(*) AS total FROM schema_migrations WHERE version=%s",
                               ("001_competitive_periods",))
                self.assertEqual(cursor.fetchone()["total"], 1)
