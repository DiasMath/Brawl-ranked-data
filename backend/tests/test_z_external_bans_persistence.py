from contextlib import nullcontext
from copy import deepcopy
import os
import secrets
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from app.db import database, prepare_collection
from app.main import app
from app.repositories.external_meta import latest_bans, save_bans
from app.services.external_bans import format_bans
from app.services.supercell import CollectionError
from test_external_bans import source_data


@unittest.skipUnless(os.getenv("BRAWL_TEST_DATABASE_URL"), "Use a disposable PostgreSQL database")
class ExternalBansPersistenceTest(unittest.TestCase):
    def test_cache_rank_map_isolation_daily_history_and_failed_refresh(self):
        token = secrets.token_hex(32)
        environment = {"DATABASE_URL": os.environ["BRAWL_TEST_DATABASE_URL"], "BRAWL_SERVICE_TOKEN": token,
                       "BRAWL_ENVIRONMENT": "development", "BRAWL_COLLECTION_INTERVAL_SECONDS": "300", "BRAWL_PLAYER_TAG": ""}
        headers = {"Authorization": "Bearer " + token}
        payload = format_bans(*source_data(), "Test map", "masters", "2026-11-11", "2026-11-12", "2026-11-19")
        with patch.dict(os.environ, environment), TestClient(app) as client:
            self.assertEqual(client.get("/api/meta/bans").status_code, 401)
            with patch("app.routers.external_meta.draftmeta_session", return_value=nullcontext(Mock())), \
                    patch("app.routers.external_meta.read_bans", return_value=payload) as read:
                for cached in (False, True):
                    response = client.post("/api/meta/bans", headers=headers, json={"map": "Test map", "rank": "masters"})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json()["cached"], cached)
                self.assertEqual(read.call_count, 1)
            self.assertIsNone(client.get("/api/meta/bans?map=Other", headers=headers).json()["snapshot"])
            self.assertIsNone(client.get("/api/meta/bans?map=Test%20map&rank=all", headers=headers).json()["snapshot"])
            with database() as (_, cursor):
                save_bans(cursor, "Test map", payload)
                cursor.execute("SELECT COUNT(*) AS total FROM external_ban_snapshots")
                self.assertEqual(cursor.fetchone()["total"], 1)
                updated = {**deepcopy(payload), "end": "2026-11-20"}
                save_bans(cursor, "Test map", updated)
                self.assertEqual(latest_bans(cursor, "Test map")["end"], "2026-11-20")
                cursor.execute("SELECT COUNT(*) AS total FROM external_ban_snapshots")
                self.assertEqual(cursor.fetchone()["total"], 2)
                cursor.execute("UPDATE external_ban_snapshots SET fetched_at=clock_timestamp()-INTERVAL '2 hours'")
            with patch("app.routers.external_meta.draftmeta_session", side_effect=CollectionError(502, "Fonte indisponível")):
                response = client.post("/api/meta/bans", headers=headers, json={"map": "Test map"})
                self.assertEqual(response.status_code, 502)
            saved = client.get("/api/meta/bans?map=Test%20map", headers=headers).json()["snapshot"]
            self.assertEqual(saved["end"], "2026-11-20")
            self.assertFalse(saved["fresh"])
            prepare_collection()
