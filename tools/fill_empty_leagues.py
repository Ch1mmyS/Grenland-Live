import json
from pathlib import Path

DATA = Path("data")

# Filene du sa er tomme
TARGETS = {
    "laliga": "laliga.json",
    "premier_league": "premier_league.json",
    "champions_league": "champions.json",
}

# Hva vi matcher i football.json (ofte ligger liga-navnet i feltet "league")
# Vi matcher "løst" så vi tåler små variasjoner/feilstavinger.
MATCH_RULES = {
    "laliga": ["laliga", "la liga"],
    "premier_league": ["premier league", "premier leauge", "premier leauge"],  # tåler feil
    "champions_league": ["champions league", "champions leageu", "champions leage"],  # tåler feil
}

def load_json(p: Path):
    if not p.exists():
        return None
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)

def save_json(p: Path, obj):
    with p.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def extract_games(obj):
    if obj is None:
        return []
    if isinstance(obj, list):
        return obj
    for key in ["games", "matches", "fixtures", "events", "items", "data", "response", "results"]:
        v = obj.get(key)
        if isinstance(v, list):
            return v
    # nested variants
    for k, v in obj.items():
        if isinstance(v, dict):
            for key in ["games", "matches", "fixtures", "events", "items", "data", "response", "results"]:
                vv = v.get(key)
                if isinstance(vv, list):
                    return vv
    return []

def norm(s):
    return (str(s or "")).strip().lower()

def match_league(game, keywords):
    # prøv vanlige felt som "league", "competition", "tournament"
    fields = [
        game.get("league"),
        game.get("competition"),
        game.get("tournament"),
        game.get("name"),
    ]
    hay = " ".join(norm(x) for x in fields if x)
    if not hay:
        return False
    return any(k in hay for k in keywords)

def is_empty_games_file(p: Path):
    obj = load_json(p)
    games = extract_games(obj)
    return len(games) == 0

def main():
    football = load_json(DATA / "football.json")
    football_games = extract_games(football)

    if not football_games:
        print("WARN: data/football.json har ingen games/matches/fixtures å splitte.")
        return

    # Bygg liga-filer fra football.json
    for key, filename in TARGETS.items():
        outpath = DATA / filename

        # kun fyll hvis filen er tom (du sa de er tomme)
        if not is_empty_games_file(outpath):
            print(f"SKIP {filename}: har allerede data")
            continue

        keywords = [norm(k) for k in MATCH_RULES[key]]
        selected = [g for g in football_games if isinstance(g, dict) and match_league(g, keywords)]

        save_json(outpath, {"games": selected})
        print(f"WROTE {filename}: {len(selected)} games")

    # Håndball/vintersport: vi lar de stå tomme hvis du ikke har en master-kilde som fyller dem
    # (Dette blir neste steg: legge til ICS/kilder for å fylle dem.)
    for fname in [
        "handball_vm_2026_menn.json",
        "handball_vm_2026_damer.json",
        "vintersport_menn.json",
        "vintersport_kvinner.json",
    ]:
        p = DATA / fname
        if not p.exists():
            continue
        if is_empty_games_file(p):
            print(f"INFO {fname}: fortsatt tom (ingen master-kilde definert)")

if __name__ == "__main__":
    main()
