from app.campus import LOTS, OSM_ATTRIBUTION


def test_all_ub_lots_from_osm():
    names = {l["name"] for l in LOTS}
    assert len(LOTS) >= 30
    assert {"Jarvis A", "Jarvis B", "Governors A", "Governors C", "Ketter Lot", "Fronczak A", "Center for Tomorrow"} <= names
    # nearby non-UB properties are excluded (no operator=University at Buffalo in OSM)
    assert not names & {"Beane Lot", "Crofts Lot", "Helm Lot", "Kenefic Place"}
    assert "OpenStreetMap" in OSM_ATTRIBUTION
    # the original four keep their slugs and come first, so their DB ids (1-4) never change
    assert [l["slug"] for l in LOTS[:4]] == ["jarvis-a", "hochstetter-b", "center-for-tomorrow", "stadium"]
    assert len({l["slug"] for l in LOTS}) == len(LOTS)


def test_capacities_are_labelled_estimates():
    cft = next(l for l in LOTS if l["slug"] == "center-for-tomorrow")
    assert cft["total_capacity"] == 400 and cft["capacity_is_seed_estimate"] is False  # OSM capacity tag
    assert all(l["capacity_is_seed_estimate"] for l in LOTS if l["slug"] != "center-for-tomorrow")
    assert all("estimated" in l["description"] or "from OSM" in l["description"] for l in LOTS)


def test_sync_adds_new_lots_to_an_existing_db_without_renumbering(client):
    from app.database import SessionLocal
    from app.models import ParkingLot
    from app.seed import seed
    with SessionLocal() as db:
        # simulate a pre-import database: only the original four lots, with old seed capacities
        for lot in db.query(ParkingLot).filter(ParkingLot.id > 4):
            db.delete(lot)
        db.get(ParkingLot, 1).total_capacity = 220
        db.commit()
        seed(db)
        lots = db.query(ParkingLot).order_by(ParkingLot.id).all()
        assert len(lots) == len(LOTS)
        assert [l.slug for l in lots[:4]] == ["jarvis-a", "hochstetter-b", "center-for-tomorrow", "stadium"]
        assert lots[0].total_capacity == LOTS[0]["total_capacity"]  # config wins over stale DB values
    assert client.get("/api/parking/lots").json()["totals"]["total_capacity"] == sum(l["total_capacity"] for l in LOTS)


def test_nearest_lot_detection_uses_real_outlines(client):
    # Standing in the real Governors A lot (south of White Rd), per UB's Wayfinder map
    gov_a = next(l for l in LOTS if l["name"] == "Governors A")
    r = client.get("/api/parking/locate", params={"lat": gov_a["lat"], "lng": gov_a["lng"], "accuracy_m": 15}).json()
    assert r["lot"]["name"] == "Governors A" and r["method"] == "inside_outline"
