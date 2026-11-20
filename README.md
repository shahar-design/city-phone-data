# city-phone-data

US city list for Service Boosters landing pages: ad location ID -> city name + area codes.
Read by city-phone.js on each page (via jsDelivr). Built by build_data.py.

- `g/<n>.json`: Google Ads location ID -> [city, state, area codes] (n = ID % 32)
- `m/<n>.json`: Microsoft Advertising location ID -> Google Ads location ID (n = ID % 32)

## One city script (2026-11-20)
- `city.js`: the one script every page loads: `<script src="https://cdn.jsdelivr.net/gh/shahar-design/city-phone-data@main/city.js" data-client="<client>"></script>`
- `clients/<client>.json`: each client's settings (text to swap, states, numbers, call-tracking pools).
- `data/g/<n>.json`: Google location ID (city, zip code, neighborhood) -> [city, state, area codes] (n = ID % 64). `data/m/<n>.json`: Microsoft ID -> Google ID.
- `g/`, `m/` at the top: old format, used only by tag v1 until every page is switched.
