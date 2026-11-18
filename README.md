# city-phone-data

US city list for Service Boosters landing pages: ad location ID -> city name + area codes.
Read by city-phone.js on each page (via jsDelivr). Built by build_data.py.

- `g/<n>.json`: Google Ads location ID -> [city, state, area codes] (n = ID % 32)
- `m/<n>.json`: Microsoft Advertising location ID -> Google Ads location ID (n = ID % 32)
