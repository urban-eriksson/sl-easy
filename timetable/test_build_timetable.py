"""python3 -m unittest discover -s timetable"""

import datetime
import gzip
import json
import os
import tempfile
import unittest
import zipfile

import build_timetable

FEED = {
    "calendar": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
    "1,0,0,0,0,0,0,0,20261101,20261231\n",
    "calendar_dates": "service_id,date,exception_type\n1,20261126,1\n2,20261127,1\n9,20270101,1\n",
    "routes": "route_id,agency_id,route_short_name,route_long_name,route_type,route_desc\n"
    "R4,A,4,,700,blåbuss\nR9,A,9,,401,\n",
    "stops": "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code\n"
    "9021001001131000,Odenplan,0,0,1,,\n"
    "9021001001121000,Rådmansgatan,0,0,1,,\n"
    "9021001001111000,Hötorget,0,0,1,,\n"
    "9022001001131001,Odenplan,0,0,0,9021001001131000,A\n"
    "9022001001121001,Rådmansgatan,0,0,0,9021001001121000,B\n"
    "9022001001111001,Hötorget,0,0,0,9021001001111000,\n",
    "trips": "route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id,shape_id\n"
    "R4,1,T1,,,0,\nR4,2,T2,,,0,\nR4,9,T3,,,0,\n",
    "stop_times": "trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign,pickup_type,drop_off_type\n"
    "T1,08:00:00,08:00:00,9022001001131001,1,Hötorget via Rådmansgatan,0,1\n"
    "T1,08:02:00,08:03:00,9022001001121001,2,Hötorget,0,0\n"
    "T1,08:05:00,08:05:00,9022001001111001,3,Hötorget,1,0\n"
    "T2,25:00:00,25:00:00,9022001001131001,1,Hötorget via Rådmansgatan,0,1\n"
    "T2,25:02:00,25:03:00,9022001001121001,2,Hötorget,1,0\n"
    "T2,25:05:00,25:05:00,9022001001111001,3,Hötorget,1,0\n"
    "T3,09:00:00,09:00:00,9022001001131001,1,Hötorget,0,1\n"
    "T3,09:05:00,09:05:00,9022001001111001,2,Hötorget,1,0\n",
}
# Stop area 1131 is listed under two stations, as some two hundred are.
SITES = [[9117, "Odenplan", 0, 0, [1131]], [9118, "Rådmansgatan", 0, 0, [1121]], [77, "Odenplan norra", 0, 0, [1131]]]


class BuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        path = os.path.join(cls.dir.name, "feed.zip")
        with zipfile.ZipFile(path, "w") as z:
            for name, text in FEED.items():
                z.writestr(f"{name}.txt", "﻿" + text)
        sites = os.path.join(cls.dir.name, "sites.json")
        with open(sites, "w") as f:
            json.dump(SITES, f)
        cls.out = os.path.join(cls.dir.name, "out")
        with zipfile.ZipFile(path) as z:
            cls.summary = build_timetable.build(
                z, build_timetable.load_sites(sites), datetime.date(2026, 11, 26), cls.out
            )

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def read(self, name):
        with gzip.open(os.path.join(self.out, name)) as f:
            return json.load(f)

    def test_current_lists_the_services_of_each_day_in_the_window(self):
        current = self.read("current.json")
        self.assertEqual(current["version"], "20261126")
        self.assertEqual(current["dates"]["20261125"], [])
        self.assertEqual(current["dates"]["20261126"], [1])
        self.assertEqual(current["dates"]["20261127"], [2])
        self.assertEqual(list(current["dates"])[-1], "20261204")

    def test_station_lists_departures_of_services_in_the_window_only(self):
        station = self.read("s/9117.json")
        self.assertEqual(station["routes"], [[0, "4", "BUS", "blåbuss"]])
        self.assertEqual(station["signs"], ["Hötorget via Rådmansgatan"])
        self.assertEqual(station["calls"], [[0, 0, 0, 1131, "A", 0]])
        # T1 at 08:00 and T2 at 25:00; T3's service runs outside the window.
        self.assertEqual(station["departures"], [28800, 0, 1, 0, 90000, 0, 2, 0])
        self.assertEqual(self.summary, {"stations": 3, "routes": 1, "trips": 2, "version": "20261126"})

    def test_a_shared_stop_area_goes_to_every_station_it_is_listed_under(self):
        self.assertEqual(self.read("s/77.json"), self.read("s/9117.json"))

    def test_no_departure_where_boarding_is_not_allowed_or_at_the_last_stop(self):
        # Rådmansgatan: T1 picks up, T2 does not. Hötorget is only ever the last stop.
        self.assertEqual(self.read("s/9118.json")["departures"], [28980, 0, 1, 0])
        self.assertFalse(os.path.exists(os.path.join(self.out, "s/9119.json")))

    def test_route_has_the_stops_and_the_running_times(self):
        route = self.read("r/0.json")
        self.assertEqual(route["areas"], [[1131, "Odenplan"], [1121, "Rådmansgatan"], [1111, "Hötorget"]])
        self.assertEqual(route["patterns"], [[0, 1, 2]])
        self.assertEqual(route["profiles"], [[[0, 120, 300], [0, 180, 300]]])
        self.assertFalse(os.path.exists(os.path.join(self.out, "r/1.json")))


if __name__ == "__main__":
    unittest.main()
