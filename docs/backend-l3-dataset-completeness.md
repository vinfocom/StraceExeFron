# Backend L3 dataset completeness

The frontend calls `GetDiagnosticMapRows`, `GetDiagnosticExcelRows`, and
`GetDiagnosticL3Summary` with a `take` query parameter. The API client in this
repository does not define a page number, offset, cursor, continuation token, or
`hasMore` request contract. This checkout also contains no backend controller or
OpenAPI definition for those endpoints. The frontend therefore does not send
pagination parameters that have not been confirmed by the service.

The analyzer now reports an incomplete result when the response advertises a
larger total (or an explicit partial/truncated flag), and warns when a view
returns the full requested 50,000 rows without enough metadata to verify
completeness. A complete multi-page load requires the backend contract to
document a continuation request and response fields such as the next cursor and
total/remaining row count. Once available, the frontend can follow that
contract with cancellation, a page bound, and completeness tracking.

## RF Investigation

The RF Investigation tab loads measurements only when opened, through the
existing authenticated `mapViewApi.getNetworkLog` adapter
(`/api/MapView/GetNetworkLog`). That adapter currently accepts session IDs,
`page`, and `limit`. The tab uses that existing contract and retains raw rows
for its worker adapter. `useNetworkSamples.js` shows existing source aliases
for LTE/NR RSRP, RSRQ, SINR, and DL/UL throughput, but its normalized map rows
can substitute a generic signal field for RSRP. The investigation therefore
reads raw response fields instead. It does not treat RSSI as RSRP. Throughput
is shown only when the response includes a unit field.

Matching defaults to an absolute 2,000 ms difference and the UI permits
250, 500, 1,000, 2,000, or 5,000 ms. The closest sample inside the inclusive
tolerance is exact at zero difference or nearby otherwise. Equal-distance
ties are ambiguous. Known session IDs and device/SIM IDs must agree; a missing
session identity can be bridged only when the selected dataset scope contains
exactly one session. A device/SIM identity present on only one row prevents a
match. Timestamp-only values without a date are rejected, so midnight is
compared on full date-time values.

The network-log response may omit a total count or explicit completion flag;
in that case the UI marks completeness as unknown, even when the response is
shorter than the request size. It also carries the L3/Event detail completeness
notice into the tab. Upload-only analyzer scopes have no session IDs, and this
checkout documents no network-log retrieval by upload ID. For those datasets,
RF measurements are shown as unavailable. Backend support would need to expose
network measurements for an upload ID, or provide a documented binding from
that upload to its session IDs. Throughput needs an explicit source unit, and
multi-session responses need stable session and device/SIM identities for
unambiguous matching.
