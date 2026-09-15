import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClutterFeatureCollection,
  parseClutterWkt,
} from "./clutterGeometry.js";

test("parses WKT polygon coordinates as longitude, latitude", () => {
  assert.deepEqual(
    parseClutterWkt("POLYGON((77.381 28.621,77.382 28.621,77.382 28.622,77.381 28.621))"),
    {
      type: "Polygon",
      coordinates: [[[77.381, 28.621], [77.382, 28.621], [77.382, 28.622], [77.381, 28.621]]],
    },
  );
});

test("preserves polygon holes and closes an open ring", () => {
  const geometry = parseClutterWkt(
    "POLYGON((77 28,78 28,78 29,77 29),(77.2 28.2,77.3 28.2,77.3 28.3,77.2 28.2))",
  );

  assert.equal(geometry.type, "Polygon");
  assert.equal(geometry.coordinates.length, 2);
  assert.deepEqual(geometry.coordinates[0][0], [77, 28]);
  assert.deepEqual(geometry.coordinates[0][geometry.coordinates[0].length - 1], [77, 28]);
});

test("parses multipolygons and optional EPSG:4326 prefix", () => {
  const geometry = parseClutterWkt(
    "SRID=4326;MULTIPOLYGON(((77 28,78 28,78 29,77 29,77 28)),((79 28,80 28,80 29,79 29,79 28)))",
  );

  assert.equal(geometry.type, "MultiPolygon");
  assert.equal(geometry.coordinates.length, 2);
});

test("rejects empty, unsupported, out-of-range, and malformed geometries", () => {
  assert.equal(parseClutterWkt("POLYGON EMPTY"), null);
  assert.equal(parseClutterWkt("POINT(77 28)"), null);
  assert.equal(parseClutterWkt("SRID=3857;POLYGON((77 28,78 28,78 29,77 28))"), null);
  assert.equal(parseClutterWkt("POLYGON((181 28,78 28,78 29,181 28))"), null);
  assert.equal(parseClutterWkt("POLYGON((bad,78 28,78 29,77 28))"), null);
  assert.equal(parseClutterWkt("POLYGON((0 0,1 1,2 2,0 0))"), null);
  assert.equal(parseClutterWkt(`POLYGON((${Array(10001).fill("77 28").join(",")}))`), null);
});

test("deduplicates tile/building intersections and keeps all building labels", () => {
  const result = buildClutterFeatureCollection([
    {
      clutterTileId: 501,
      gridId: "GRID_1025",
      clutterClass: "Building",
      clutterPolygonWkt: "POLYGON((77.381 28.621,77.382 28.621,77.382 28.622,77.381 28.621))",
      buildingPolygonId: 25,
      buildingPolygonName: "Building A",
    },
    {
      clutterTileId: 501,
      gridId: "GRID_1025",
      clutterClass: "Building",
      clutterPolygonWkt: "POLYGON((77.381 28.621,77.382 28.621,77.382 28.622,77.381 28.621))",
      buildingPolygonId: 26,
      buildingPolygonName: "Building B",
    },
  ]);

  assert.equal(result.featureCollection.features.length, 1);
  assert.deepEqual(result.featureCollection.features[0].properties.buildingPolygonIds, ["25", "26"]);
  assert.deepEqual(result.featureCollection.features[0].properties.buildingPolygonNames, ["Building A", "Building B"]);
  assert.deepEqual(result.classCounts, [["Building", 1]]);
});

test("skips invalid tile geometry and reports inconsistent duplicate tile geometry", () => {
  const result = buildClutterFeatureCollection([
    { clutterTileId: 1, clutterPolygonWkt: "POINT(77 28)" },
    {
      clutterTileId: 2,
      clutterPolygonWkt: "POLYGON((77 28,78 28,78 29,77 28))",
      buildingPolygonName: "Building A",
    },
    {
      clutterTileId: 2,
      clutterPolygonWkt: "POLYGON((79 28,80 28,80 29,79 28))",
      buildingPolygonName: "Building B",
    },
  ]);

  assert.equal(result.featureCollection.features.length, 1);
  assert.equal(result.invalidGeometryCount, 1);
  assert.equal(result.conflictingGeometryCount, 1);
  assert.deepEqual(result.featureCollection.features[0].properties.buildingPolygonNames, ["Building A", "Building B"]);
});
