# Grenland Live

En Streamlit-app som viser:
- 🍻 Hva som skjer i Skien og Porsgrunn (arrangementer + faste ukedager)
- ⚽ Kommende fotballkamper med dato, klokkeslett og TV-kanal

## Funksjoner
- Filtrering på område og periode (i dag / helg / neste 14 dager)
- Faste ukedager får faktiske datoer
- Scraping av utvalgte utesteder
- Fotball fixtures fra football-data.co.uk
- Forsøk på TV-kanal (Premier League)

## Kjør lokalt
```bash
pip install -r requirements.txt
streamlit run app.py
