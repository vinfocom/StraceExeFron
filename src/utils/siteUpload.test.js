import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSiteUploadFile } from "./siteUpload.js";

const headers = "site,sector,cell_id,longitude,latitude,pci,azimuth,band,earfcn,cluster,technology";
const validate = (longitude, latitude, band = "3", cluster = "Airtel") =>
  normalizeSiteUploadFile(new File([
    `${headers}\nLA200516,A2,LA200516A2,${longitude},${latitude},364,0,${band},1550,${cluster},4G`,
  ], "sites.csv", { type: "text/csv" }));

test("accepts decimal coordinates, zero, and inclusive geographic boundaries", async () => {
  for (const [longitude, latitude] of [[121.456528, 25.007083], [0, 0], [-180, -90], [180, 90]]) {
    const result = await validate(longitude, latitude);
    assert.equal(result.ok, true);
    assert.match(await result.file.text(), new RegExp(`${longitude},${latitude},364,0`));
  }
});

test("reports invalid latitude and longitude even when mandatory values are also missing", async () => {
  const result = await validate(121456528, 25007083, "", "");
  assert.equal(result.ok, false);
  assert.match(result.validationMessage, /Mandatory fields are missing: band, cluster/);
  assert.match(result.validationMessage, /Invalid latitude in 1 data row/);
  assert.match(result.validationMessage, /row 2: 25007083/);
  assert.match(result.validationMessage, /Invalid longitude in 1 data row/);
  assert.match(result.validationMessage, /row 2: 121456528/);
  assert.equal(result.file, undefined);
});

test("rejects out-of-range, non-finite, and non-decimal coordinates", async () => {
  for (const value of ["180.0001", "-180.0001", "NaN", "Infinity", "1e999", "0x10", "invalid"]) {
    assert.match((await validate(value, 25)).validationMessage, /Invalid longitude/);
  }
  for (const value of ["90.0001", "-90.0001", "NaN", "Infinity", "1e999", "0x10", "invalid"]) {
    assert.match((await validate(121, value)).validationMessage, /Invalid latitude/);
  }
});

test("reports empty coordinates as mandatory instead of treating them as zero", async () => {
  const result = await validate("  ", "");
  assert.equal(result.ok, false);
  assert.match(result.validationMessage, /Mandatory fields are missing: longitude, latitude/);
  assert.doesNotMatch(result.validationMessage, /Invalid latitude|Invalid longitude/);
});

test("counts affected rows and keeps file row numbers across blank lines", async () => {
  const row = "LA200516,A2,LA200516A2,121456528,25007083,364,0,3,1550,Airtel,4G";
  const result = await normalizeSiteUploadFile(new File([
    `${headers}\n\n${row}\n${row}\n`,
  ], "sites.csv"));
  assert.match(result.validationMessage, /Invalid latitude in 2 data row/);
  assert.match(result.validationMessage, /Invalid longitude in 2 data row/);
  assert.match(result.validationMessage, /row 3: 25007083; row 4: 25007083/);
});
