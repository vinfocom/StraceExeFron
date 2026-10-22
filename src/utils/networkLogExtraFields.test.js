import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalNetworkLogFields,
  normalizeNetworkLogSampleExtras,
  parseNetworkLogExtraFields,
} from './networkLogExtraFields.js';
import { createNetworkLogCacheSnapshot } from '../features/unified-map/data/networkLogDataset.js';

const headers = {
  'DL THPT': '25.27',
  'UL THPT': '0.18',
  'PS App DL (Mbps)': '26.45',
  'PS App UL (Mbps)': '0.18',
  'NR MAC Thpt UL (Mbps)': '0.17',
  'PUSCH Tx (dBm)': '-17 dBm',
};
const legacy = {
  dl_tpt: '25.27', ul_tpt: '0.18', ps_app_dl_mbps: '26.45',
  ps_app_ul_mbps: '0.18', nr_mac_ul_mbps: '0.17', pusch_tx: '-17 dBm',
};

test('flat, nested, and double-encoded exports produce the same metric names and values', () => {
  for (const value of [legacy, headers, { network_log_fields: headers }]) {
    for (const raw of [value, JSON.stringify(value), JSON.stringify(JSON.stringify(value))]) {
      assert.deepEqual(parseNetworkLogExtraFields(raw), legacy);
    }
  }
});

test('canonical values including zero and false win over conflicting header aliases', () => {
  assert.deepEqual(parseNetworkLogExtraFields({
    'PS App DL (Mbps)': 20, ps_app_dl_mbps: 0,
    'PUSCH Tx (dBm)': 10, pusch_tx: false,
    ps_app_ul_mbps: '', network_log_fields: { 'PS App UL (Mbps)': '0.18' },
  }), { ps_app_dl_mbps: 0, pusch_tx: false, ps_app_ul_mbps: '0.18' });
});

test('distinct delivered, wire and application metrics and metadata stay separate', () => {
  const raw = { ps_app_dl_mbps: 26, wire_dl_mbps: 25, ps_delivered_dl_mbps: 24,
    ps_data: { down_bytes: 524293392 }, nr_serving: 'No', pusch_tx_measured: false, 'ENDC Setup': 'Yes' };
  assert.deepEqual(parseNetworkLogExtraFields(raw), raw);
});

test('accumulated cached and fresh dropdown fields collapse to one option per metric', () => {
  const fields = [...Object.keys(headers), ...Object.keys(legacy)];
  assert.deepEqual(canonicalNetworkLogFields(fields), Object.keys(legacy));
  assert.deepEqual(canonicalNetworkLogFields([' PS App DL (Mbps) ', 'ps_app_dl_mbps', 'PS_APP_DL_MBPS']), ['ps_app_dl_mbps']);
});

test('cached snapshots migrate aliases without changing the raw JSON or stored cache object', () => {
  const sample = { id: 1, extra_json: JSON.stringify(headers), extra_fields: headers };
  const entry = { cacheSchemaVersion: 3, complete: true, outcome: 'complete', locations: [sample] };
  const restored = createNetworkLogCacheSnapshot(entry, 'session-1', 1);
  assert.deepEqual(restored.snapshot.rows[0].extra_fields, legacy);
  assert.equal(restored.snapshot.rows[0].extra_json, sample.extra_json);
  assert.deepEqual(sample.extra_fields, headers);
  assert.deepEqual(normalizeNetworkLogSampleExtras({ extra_fields: headers }).extra_fields, legacy);
});

test('invalid extra JSON is ignored and ordinary rows remain unchanged', () => {
  for (const value of [undefined, null, '', 'invalid', '[]', 'null']) {
    assert.equal(parseNetworkLogExtraFields(value), null);
  }
  const sample = { id: 1 };
  assert.equal(normalizeNetworkLogSampleExtras(sample), sample);
});
