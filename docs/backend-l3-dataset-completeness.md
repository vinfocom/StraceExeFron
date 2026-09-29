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
