from psycopg.types.json import Jsonb


PROVIDER = "draftmeta"


def latest_snapshot(cursor, scope, patch=None, *, rank="masters"):
    cursor.execute("""
        SELECT payload, fetched_at, fetched_at >= clock_timestamp() - INTERVAL '1 hour' AS fresh
        FROM external_meta_snapshots WHERE provider=%s AND scope=%s AND rank_scope=%s
          AND (%s::date IS NULL OR patch_date=%s)
        ORDER BY patch_date DESC LIMIT 1
    """, (PROVIDER, scope, rank, patch, patch))
    row = cursor.fetchone()
    return {**row["payload"], "rank": rank, "fetched_at": row["fetched_at"].isoformat(), "fresh": row["fresh"]} if row else None


def save_snapshot(cursor, scope, payload):
    cursor.execute("""
        INSERT INTO external_meta_snapshots (provider, scope, rank_scope, patch_date, payload) VALUES (%s,%s,%s,%s,%s)
        ON CONFLICT (provider, scope, rank_scope, patch_date) DO UPDATE
        SET fetched_at=clock_timestamp(), payload=EXCLUDED.payload
    """, (PROVIDER, scope, payload["rank"], payload["patch_date"], Jsonb(payload)))


def saved_patches(cursor, scope, *, rank="masters"):
    cursor.execute("""
        SELECT patch_date FROM external_meta_snapshots WHERE provider=%s AND scope=%s AND rank_scope=%s
        ORDER BY patch_date DESC
    """, (PROVIDER, scope, rank))
    return [row["patch_date"].isoformat() for row in cursor.fetchall()]


def save_coverage(cursor, patch, maps, *, rank="masters"):
    cursor.execute("""
        INSERT INTO external_meta_coverage (provider, rank_scope, patch_date, maps) VALUES (%s,%s,%s,%s)
        ON CONFLICT (provider, rank_scope, patch_date) DO UPDATE
        SET updated_at=clock_timestamp(), maps=EXCLUDED.maps
    """, (PROVIDER, rank, patch, Jsonb(maps)))


def coverage(cursor, patch=None, *, rank="masters"):
    cursor.execute("""
        SELECT patch_date, updated_at, maps FROM external_meta_coverage
        WHERE provider=%s AND rank_scope=%s AND (%s::date IS NULL OR patch_date=%s)
        ORDER BY patch_date DESC LIMIT 1
    """, (PROVIDER, rank, patch, patch))
    row = cursor.fetchone()
    if not row:
        return None
    cursor.execute("""
        SELECT scope FROM external_meta_snapshots WHERE provider=%s AND rank_scope=%s AND patch_date=%s AND scope<>''
    """, (PROVIDER, rank, row["patch_date"]))
    saved = {item["scope"] for item in cursor.fetchall()}
    return {"patch_date": row["patch_date"].isoformat(), "updated_at": row["updated_at"].isoformat(),
            "maps": [{**item, "saved": item["name"] in saved} for item in row["maps"]]}


def saved_maps(cursor, *, rank="masters"):
    cursor.execute("""
        SELECT DISTINCT scope FROM external_meta_snapshots WHERE provider=%s AND rank_scope=%s AND scope<>'' ORDER BY scope
    """, (PROVIDER, rank))
    return [row["scope"] for row in cursor.fetchall()]


def save_current_snapshot(cursor, scope, payload, previous):
    if previous and (payload["patch_date"], payload["end"] or payload["start"]) < (
        previous["patch_date"], previous["end"] or previous["start"]
    ):
        return False
    save_snapshot(cursor, scope, payload)
    return True


def latest_bans(cursor, scope, patch=None, *, rank="masters"):
    cursor.execute("""
        SELECT payload, fetched_at, fetched_at >= clock_timestamp() - INTERVAL '1 hour' AS fresh
        FROM external_ban_snapshots WHERE provider=%s AND scope=%s AND rank_scope=%s
          AND (%s::date IS NULL OR patch_date=%s)
        ORDER BY patch_date DESC, period_end DESC LIMIT 1
    """, (PROVIDER, scope, rank, patch, patch))
    row = cursor.fetchone()
    return {**row["payload"], "fetched_at": row["fetched_at"].isoformat(), "fresh": row["fresh"]} if row else None


def save_bans(cursor, scope, payload):
    previous = latest_bans(cursor, scope, rank=payload["rank"])
    if previous and (payload["patch_date"], payload["end"]) < (previous["patch_date"], previous["end"]):
        raise ValueError("O provedor retornou um período anterior de bans")
    cursor.execute("""
        INSERT INTO external_ban_snapshots (provider,scope,rank_scope,patch_date,period_end,payload)
        VALUES (%s,%s,%s,%s,%s,%s)
        ON CONFLICT (provider,scope,rank_scope,patch_date,period_end) DO UPDATE
        SET fetched_at=clock_timestamp(), payload=EXCLUDED.payload
    """, (PROVIDER, scope, payload["rank"], payload["patch_date"], payload["end"], Jsonb(payload)))
