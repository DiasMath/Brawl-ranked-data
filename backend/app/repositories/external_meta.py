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


def save_coverage(cursor, patch, maps):
    cursor.execute("""
        INSERT INTO external_meta_coverage (provider, patch_date, maps) VALUES (%s,%s,%s)
        ON CONFLICT (provider, patch_date) DO UPDATE
        SET updated_at=clock_timestamp(), maps=EXCLUDED.maps
    """, (PROVIDER, patch, Jsonb(maps)))


def coverage(cursor, patch=None):
    cursor.execute("""
        SELECT patch_date, updated_at, maps FROM external_meta_coverage
        WHERE provider=%s AND (%s::date IS NULL OR patch_date=%s)
        ORDER BY patch_date DESC LIMIT 1
    """, (PROVIDER, patch, patch))
    row = cursor.fetchone()
    if not row:
        return None
    cursor.execute("""
        SELECT scope FROM external_meta_snapshots WHERE provider=%s AND patch_date=%s AND scope<>''
    """, (PROVIDER, row["patch_date"]))
    saved = {item["scope"] for item in cursor.fetchall()}
    return {"patch_date": row["patch_date"].isoformat(), "updated_at": row["updated_at"].isoformat(),
            "maps": [{**item, "saved": item["name"] in saved} for item in row["maps"]]}


def saved_maps(cursor):
    cursor.execute("""
        SELECT DISTINCT scope FROM external_meta_snapshots WHERE provider=%s AND scope<>'' ORDER BY scope
    """, (PROVIDER,))
    return [row["scope"] for row in cursor.fetchall()]


def save_current_snapshot(cursor, scope, payload, previous):
    if previous and (payload["patch_date"], payload["end"]) < (previous["patch_date"], previous["end"]):
        return False
    save_snapshot(cursor, scope, payload)
    return True
