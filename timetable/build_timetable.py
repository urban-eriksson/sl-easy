"""Turn SL's GTFS timetable into the small per-station files the app reads.

SL's open departure board gives the next three departures per line and nothing
later; the timetable itself is only published as a GTFS zip (Trafiklab, "GTFS
Regional static data", one download a night). This script reads that zip and
writes, for the coming days:

    current.json          {"version", "dates": {"20261126": [service ids]}}
    s/<site id>.json      every departure from one station
    r/<route index>.json  the stops and running times of one line

All files are gzip-compressed JSON. See `write_station` and `write_route` for
their layout; `apps/web/src/lib/timetable.ts` is the reader.

Runs on the dev box at night (a t3.micro shared with other apps), so it reads
the zip as a stream and keeps the departures in compact arrays. Python 3.9,
standard library only.

    python3 build_timetable.py --zip sl.zip --sites sites.json --out out/
"""

from __future__ import annotations

import argparse
import csv
import datetime
import gzip
import io
import json
import os
import sys
import zipfile
from array import array
from collections import defaultdict

# Service dates written: yesterday (its trips run past midnight) and a week on.
DAYS_BACK = 1
DAYS_AHEAD = 8

# GTFS extended route types to the modes SL's departure board uses.
MODES = {"100": "TRAIN", "401": "METRO", "700": "BUS", "900": "TRAM", "1000": "SHIP"}

WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def rows(archive: zipfile.ZipFile, name: str):
    with archive.open(f"{name}.txt") as raw:
        yield from csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))


def seconds(clock: str) -> int:
    """'25:10:30' -> seconds from the start of the service day."""
    h, m, s = clock.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def area_number(stop_area_id: str):
    """GTFS stop area '9021001001131000' -> SL's stop area id 1131."""
    if len(stop_area_id) == 16 and stop_area_id.startswith("9021001"):
        return int(stop_area_id[7:13])
    return None


def service_dates(archive: zipfile.ZipFile, dates: list[str]) -> dict[str, set[str]]:
    """The services running on each of `dates` ('YYYYMMDD')."""
    active: dict[str, set[str]] = {d: set() for d in dates}
    for r in rows(archive, "calendar"):
        for d in dates:
            day = datetime.date(int(d[:4]), int(d[4:6]), int(d[6:]))
            if r["start_date"] <= d <= r["end_date"] and r[WEEKDAYS[day.weekday()]] == "1":
                active[d].add(r["service_id"])
    for r in rows(archive, "calendar_dates"):
        if r["date"] in active:
            if r["exception_type"] == "1":
                active[r["date"]].add(r["service_id"])
            else:
                active[r["date"]].discard(r["service_id"])
    return active


def load_sites(path: str) -> dict[int, list[int]]:
    """Stop area id -> the station ("site") ids it is listed under.

    Accepts SL's site list (`/v1/sites?expand=true`) or the app's stations.json.
    """
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    sites: dict[int, list[int]] = defaultdict(list)
    for s in data:
        site_id, areas = (s[0], s[4]) if isinstance(s, list) else (s["id"], s.get("stop_areas") or [])
        for a in areas:
            sites[a].append(site_id)
    return sites


class Route:
    """One line: its stop patterns and the running-time profiles of its trips."""

    def __init__(self, index: int, row: dict):
        self.index = index
        self.designation = row["route_short_name"]
        self.mode = MODES.get(row["route_type"], "BUS")
        self.group = row["route_desc"]
        self.patterns: dict[tuple, int] = {}
        self.profiles: dict[tuple, int] = {}


def build(archive: zipfile.ZipFile, sites: dict[int, list[int]], today: datetime.date, out: str):
    dates = [
        (today + datetime.timedelta(days=n)).strftime("%Y%m%d")
        for n in range(-DAYS_BACK, DAYS_AHEAD + 1)
    ]
    active = service_dates(archive, dates)
    wanted = set().union(*active.values())
    if not wanted:
        raise SystemExit(f"no service runs on {dates[0]}..{dates[-1]}: is the feed current?")

    # Stop point -> (stop area number, platform, stop area name).
    area_names = {}
    points = {}
    stops = list(rows(archive, "stops"))
    for r in stops:
        if r["location_type"] == "1":
            area_names[r["stop_id"]] = r["stop_name"]
    for r in stops:
        if r["location_type"] in ("", "0"):
            parent = r["parent_station"] or r["stop_id"]
            number = area_number(parent)
            if number is not None:
                points[r["stop_id"]] = (number, r["platform_code"], area_names.get(parent, r["stop_name"]))
    del stops

    routes = {r["route_id"]: Route(i, r) for i, r in enumerate(rows(archive, "routes"))}
    trips = {
        r["trip_id"]: (routes[r["route_id"]], int(r["service_id"]))
        for r in rows(archive, "trips")
        if r["service_id"] in wanted and r["route_id"] in routes
    }

    # Per station: its calls (a pattern stopping here, at one position) and its
    # departures as four parallel arrays.
    calls: dict[int, dict[tuple, int]] = defaultdict(dict)
    signs: dict[str, int] = {}
    departures: dict[int, tuple[array, array, array, array]] = {}

    def flush(trip_id: str, visits: list):
        route, service = trips[trip_id]
        visits.sort()
        start = visits[0][3]
        pattern = route.patterns.setdefault(tuple(v[1] for v in visits), len(route.patterns))
        profile = route.profiles.setdefault(
            (tuple(v[2] - start for v in visits), tuple(v[3] - start for v in visits)),
            len(route.profiles),
        )
        for position, (_, point, _, departs, sign, boards) in enumerate(visits[:-1]):
            if not boards or point not in points:
                continue
            area, platform, _ = points[point]
            sign_index = signs.setdefault(sign, len(signs))
            for site in sites.get(area, ()):
                key = (route.index, pattern, position, area, platform, sign_index)
                call = calls[site].setdefault(key, len(calls[site]))
                if site not in departures:
                    departures[site] = (array("I"), array("H"), array("I"), array("H"))
                times, call_ids, services, profiles = departures[site]
                times.append(departs)
                call_ids.append(call)
                services.append(service)
                profiles.append(profile)

    current, visits = None, []
    for r in rows(archive, "stop_times"):
        trip_id = r["trip_id"]
        if trip_id != current:
            if current in trips and len(visits) > 1:
                flush(current, visits)
            current, visits = trip_id, []
        if trip_id in trips:
            departs = seconds(r["departure_time"] or r["arrival_time"])
            arrives = seconds(r["arrival_time"] or r["departure_time"])
            visits.append(
                (int(r["stop_sequence"]), r["stop_id"], arrives, departs, r["stop_headsign"], r["pickup_type"] != "1")
            )
    if current in trips and len(visits) > 1:
        flush(current, visits)

    sign_list = sorted(signs, key=signs.get)
    route_list = sorted(routes.values(), key=lambda route: route.index)
    for site, columns in departures.items():
        write_station(out, site, calls[site], columns, route_list, sign_list)
    used = 0
    for route in route_list:
        if route.patterns:
            write_route(out, route, points)
            used += 1

    version = today.strftime("%Y%m%d")
    write(out, "current.json", {"version": version, "dates": {d: sorted(map(int, active[d])) for d in dates}})
    return {"stations": len(departures), "routes": used, "trips": len(trips), "version": version}


def write_station(out, site, site_calls, columns, route_list, sign_list):
    """s/<site>.json

    routes:  [route index, line, mode, group] for the lines that stop here
    signs:   destination texts
    calls:   [index into routes, pattern, position in pattern, stop area, platform, index into signs]
    departures: flat [seconds into the service day, call, service id, profile] * n, by time
    """
    route_ids: dict[int, int] = {}
    sign_ids: dict[int, int] = {}
    call_rows = []
    for (route, pattern, position, area, platform, sign), _ in sorted(site_calls.items(), key=lambda c: c[1]):
        call_rows.append(
            [
                route_ids.setdefault(route, len(route_ids)),
                pattern,
                position,
                area,
                platform,
                sign_ids.setdefault(sign, len(sign_ids)),
            ]
        )
    times, call_ids, services, profiles = columns
    flat = []
    for i in sorted(range(len(times)), key=times.__getitem__):
        flat += (times[i], call_ids[i], services[i], profiles[i])
    write(
        out,
        f"s/{site}.json",
        {
            "routes": [
                [r, route_list[r].designation, route_list[r].mode, route_list[r].group]
                for r in sorted(route_ids, key=route_ids.get)
            ],
            "signs": [sign_list[s] for s in sorted(sign_ids, key=sign_ids.get)],
            "calls": call_rows,
            "departures": flat,
        },
    )


def write_route(out, route: Route, points):
    """r/<route index>.json

    areas:    [stop area id, name]
    patterns: each a list of indexes into areas, in travel order
    profiles: [arrival offsets, departure offsets] in seconds from the trip's start,
              one per stop of its pattern; departures is null when equal to arrivals
    """
    area_ids: dict[int, int] = {}
    areas = []
    patterns = []
    for stops in sorted(route.patterns, key=route.patterns.get):
        indexes = []
        for point in stops:
            number, _, name = points.get(point, (0, "", ""))
            if number not in area_ids:
                area_ids[number] = len(areas)
                areas.append([number, name])
            indexes.append(area_ids[number])
        patterns.append(indexes)
    profiles = [
        [list(arrive), None if arrive == depart else list(depart)]
        for arrive, depart in sorted(route.profiles, key=route.profiles.get)
    ]
    write(out, f"r/{route.index}.json", {"areas": areas, "patterns": patterns, "profiles": profiles})


def write(out: str, name: str, data):
    path = os.path.join(out, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
    # mtime=0 keeps the bytes identical from night to night when the data is.
    with open(path, "wb") as f:
        f.write(gzip.compress(body, compresslevel=9, mtime=0))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--zip", required=True, help="the GTFS zip from Trafiklab")
    parser.add_argument("--sites", required=True, help="SL's site list, or the app's stations.json")
    parser.add_argument("--out", required=True, help="directory to write into")
    parser.add_argument("--today", help="YYYY-MM-DD, default today in Stockholm (the box runs in UTC)")
    args = parser.parse_args(argv)
    if args.today:
        today = datetime.date.fromisoformat(args.today)
    else:
        from zoneinfo import ZoneInfo

        today = datetime.datetime.now(ZoneInfo("Europe/Stockholm")).date()
    with zipfile.ZipFile(args.zip) as archive:
        summary = build(archive, load_sites(args.sites), today, args.out)
    print(json.dumps(summary))
    # A feed that lost most of its stations must not replace last night's files.
    if summary["stations"] < 4000:
        raise SystemExit(f"only {summary['stations']} stations: refusing")


if __name__ == "__main__":
    sys.exit(main())
