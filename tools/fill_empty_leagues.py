import json
from pathlib import Path
from collections import Counter

DATA = Path("data")

TARGETS = {
    "laliga": "laliga.json",
    "premier_league": "premier_league.json",
    "champions_league": "champions.json",
}

MATCH_RULES = {
    "laliga": [
        "laliga", "la liga", "spanish la liga", "primera", "primera division",
        "primera división", "liga espanola", "liga española", "liga santander",
        "laliga ea", "ea sports laliga"
    ],
    "premier_league": [
        "premier league", "premier leauge", "premier leageu", "epl", "england premier"
    ],
    "champions_league": [
        "champions league", "uefa champions", "ucl", "champions-league",
        "uefa cl", "uefa champions league", "champions league -"
    ],
}

def load_json(p: Path):
    if not p.exists():
        return None
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)

def save_json(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def extract_list(obj):
    if obj is None:
        return []
    if isinstance(obj, list):
        return obj
    if not isinstance(obj, dict):
        return []
    keys = ["games", "matches", "fixtures", "events", "items", "data", "response", "results"]
    for k in keys:
        v = obj.get(k)
        if isinstance(v, list):
            return v
    for v in obj.values():
        if isinstance(v, dict):
            for k in keys:
                vv = v.get(k)
                if isinstance(vv, list):
                    return vv
    return []

def norm(s):
    return str(s or "").strip().lower()

def league_text(game: dict) -> str:
    for k in ["league", "competition", "tournament", "name"]:
        if isinstance(game.get(k), str) and game.get(k).strip():
            return game[k]
    comp = game.get("competition")
    if isinstance(comp, dict):
        for k in ["name", "code"]:
            if isinstance(comp.get(k), str) and comp.get(k).strip():
                return comp[k]
    return ""

def match_league(game: dict, keywords: list[str]) -> bool:
    txt = norm(league_text(game))
    if not txt:
        return False
    return any(k in txt for k in keywords)

def is_empty_games_file(p: Path) -> bool:
    obj = load_json(p)
    games = extract_list(obj)
    return len(games) == 0

def print_league_summary(games: list[dict], top_n: int = 40):
    c = Counter()
    for g in games:
        if isinstance(g, dict):
            lt = league_text(g)
            if lt:
                c[lt.strip()] += 1
    print("---- football.json league summary (top) ----")
    for name, n in c.most_common(top_n):
        print(f"{n:4d}  {name}")
    if not c:
        print("WARN: Fant ingen liga-navn i football.json (mangler felt league/competition/tournament/name).")
    print("-------------------------------------------")

def main():
    football = load_json(DATA / "football.json")
    football_games = extract_list(football)

    if not football_games:
        print("WARN: data/football.json har ingen liste på keys (games/matches/fixtures/etc). Ingenting å splitte.")
        return

    print_league_summary([g for g in football_games if isinstance(g, dict)])

    for key, filename in TARGETS.items():
        outpath = DATA / filename

        if not is_empty_games_file(outpath):
            print(f"SKIP {filename}: har allerede data")
            continue

        keywords = [norm(k) for k in MATCH_RULES[key]]
        selected = [
            g for g in football_games
            if isinstance(g, dict) and match_league(g, keywords)
        ]

        save_json(outpath, {"games": selected})
        print(f"WROTE {filename}: {len(selected)} games")

    for fname in [
        "handball_vm_2026_menn.json",
        "handball_vm_2026_damer.json",
        "vintersport_menn.json",
        "vintersport_kvinner.json",
        "vm2026.json",
    ]:
        p = DATA / fname
        if p.exists() and is_empty_games_file(p):
            print(f"INFO {fname}: fortsatt tom (mangler egen kilde/skript som fyller denne)")

if __name__ == "__main__":
    main()
