from psycopg.types.json import Jsonb


PROVIDER = "draftmeta"


def latest_snapshot(cursor, scope, patch=None):
    cursor.execute("""
        SELECT payload, fetched_at, fetched_at >= clock_timestamp() - INTERVAL '1 hour' AS fresh
        FROM external_meta_snapshots WHERE provider=%s AND scope=%s
          AND (%s::date IS NULL OR patch_date=%s)
        ORDER BY patch_date DESC LIMIT 1
    """, (PROVIDER, scope, patch, patch))
    row = cursor.fetchone()
    return {**row["payload"], "fetched_at": row["fetched_at"].isoformat(), "fresh": row["fresh"]} if row else None


def save_snapshot(cursor, scope, payload):
    cursor.execute("""
        INSERT INTO external_meta_snapshots (provider, scope, patch_date, payload) VALUES (%s,%s,%s,%s)
        ON CONFLICT (provider, scope, patch_date) DO UPDATE
        SET fetched_at=clock_timestamp(), payload=EXCLUDED.payload
    """, (PROVIDER, scope, payload["patch_date"], Jsonb(payload)))


def saved_patches(cursor, scope):
    cursor.execute("""
        SELECT patch_date FROM external_meta_snapshots WHERE provider=%s AND scope=%s
        ORDER BY patch_date DESC
    """, (PROVIDER, scope))
    return [row["patch_date"].isoformat() for row in cursor.fetchall()]
