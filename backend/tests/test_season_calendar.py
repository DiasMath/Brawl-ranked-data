import os
import secrets
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.db import database, prepare_collection
from app.main import app


@unittest.skipUnless(os.getenv("BRAWL_TEST_DATABASE_URL"), "Use a disposable PostgreSQL database")
class SeasonCalendarTest(unittest.TestCase):
    def test_transition_adjustment_validation_and_history_revision(self):
        service_token = secrets.token_hex(32)
        environment = {"DATABASE_URL": os.environ["BRAWL_TEST_DATABASE_URL"],
                       "BRAWL_SERVICE_TOKEN": service_token, "BRAWL_COLLECTION_INTERVAL_SECONDS": "300",
                       "BRAWL_ENVIRONMENT": "development", "BRAWL_PLAYER_TAG": ""}
        headers = {"Authorization": "Bearer " + service_token}
        with patch.dict(os.environ, environment), TestClient(app) as client:
            self.assertEqual(client.get("/api/seasons").status_code, 401)
            response = client.get("/api/seasons", headers=headers)
            self.assertEqual(response.status_code, 200)
            initial = response.json()
            old, new = initial["seasons"][-2:]
            self.assertEqual(old["ends_at"], new["starts_at"])
            self.assertEqual(new["starts_at"], "2026-11-19T00:00:00.000Z")
            self.assertTrue(new["date_only"])
            update = {"id": new["id"], "label": "Temporada 51", "starts_at": "2026-11-19T08:00:00Z",
                      "source_url": "https://example.com/confirmed-test-reset", "date_only": False}
            for invalid in ({"starts_at": "2026-11-19T08:00:00"}, {"starts_at": old["starts_at"]},
                            {"starts_at": new["ends_at"]}, {"source_url": "http://example.com"}, {"id": "missing"}):
                result = client.post("/api/seasons", headers=headers, json={**update, **invalid})
                self.assertEqual(result.status_code, 422, result.text)
            saved = client.post("/api/seasons", headers=headers, json=update)
            self.assertEqual(saved.status_code, 200, saved.text)
            adjusted = saved.json()
            self.assertNotEqual(adjusted["revision"], initial["revision"])
            previous, current = adjusted["seasons"][-2:]
            self.assertEqual(previous["ends_at"], current["starts_at"])
            self.assertEqual(current["starts_at"], "2026-11-19T08:00:00.000Z")
            self.assertFalse(current["date_only"])
            prepare_collection()
            self.assertEqual(client.get("/api/seasons", headers=headers).json(), adjusted)
            with database() as (_, cursor):
                cursor.execute("SELECT previous_value, next_value FROM ranked_season_changes ORDER BY id DESC LIMIT 1")
                audit = cursor.fetchone()
                self.assertEqual(audit["previous_value"], initial["seasons"])
                self.assertEqual(audit["next_value"], adjusted["seasons"])
                cursor.execute("INSERT INTO tracked_accounts (player_tag) VALUES ('#LJPJJULG8') ON CONFLICT DO NOTHING")
            history = client.get("/api/collection/history?tag=LJPJJULG8", headers=headers)
            self.assertEqual(history.status_code, 200, history.text)
            self.assertEqual(history.json()["calendar_revision"], adjusted["revision"])
            self.assertEqual(history.json()["snapshot"]["ranked_seasons"], adjusted["seasons"])
            with patch("app.routers.collection.latest_run", return_value={"id": 7}), \
                    patch("app.routers.collection.dataset", return_value={}) as load_dataset:
                for revision, expected in ((adjusted["revision"], 7), (initial["revision"], 0), (None, 0)):
                    params = {"tag": "LJPJJULG8", "after": 7}
                    if revision is not None:
                        params["calendar_revision"] = revision
                    result = client.get("/api/collection/history", headers=headers, params=params)
                    self.assertEqual(result.status_code, 200, result.text)
                    self.assertEqual(load_dataset.call_args.kwargs["after_run"], expected)
            restore = {key: new[key] for key in update}
            self.assertEqual(client.post("/api/seasons", headers=headers, json=restore).status_code, 200)

