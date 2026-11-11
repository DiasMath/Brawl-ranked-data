from ..domain import tag


def list_accounts(cursor):
    cursor.execute("""
        SELECT a.player_tag AS tag, COALESCE(p.player_name, a.player_tag) AS name
        FROM tracked_accounts a
        LEFT JOIN account_profile p ON p.player_tag = a.player_tag
        ORDER BY a.created_at, a.player_tag
    """)
    return cursor.fetchall()


def find_player(cursor, requested):
    if requested is None:
        cursor.execute("SELECT player_tag FROM tracked_accounts ORDER BY created_at, player_tag LIMIT 1")
    else:
        cursor.execute("SELECT player_tag FROM tracked_accounts WHERE player_tag=%s", (tag(requested),))
    row = cursor.fetchone()
    return row["player_tag"] if row else None


def save_account(cursor, player):
    cursor.execute("""
        INSERT INTO tracked_accounts (player_tag)
        VALUES (%s)
        ON CONFLICT (player_tag) DO NOTHING
    """, (player,))
