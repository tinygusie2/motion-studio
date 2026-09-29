// The parts of the Android demo source that need no phone: reading what adb prints, finding fields, cutting a picture stream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDevices, parseWmSize, parseUiDump, fieldsFromDump, escapeInputText, canTypeOverAdb } from '../src/demo-android.mjs';
import { pickValue, defaultDatasets } from '../src/demo.mjs';

test('parseDevices: serials, states and model names', () => {
  const out = `List of devices attached
emulator-5554          device product:sdk_gphone64 model:Pixel_8_API_34 device:emu64x transport_id:1
R58M123ABC             unauthorized usb:1-1 transport_id:2
0123456789             offline

`;
  const d = parseDevices(out);
  assert.deepEqual(d.map(x => [x.serial, x.state, x.name]), [['emulator-5554', 'device', 'Pixel 8 API 34'], ['R58M123ABC', 'unauthorized', 'R58M123ABC'], ['0123456789', 'offline', '0123456789']]);
  assert.deepEqual(parseDevices('List of devices attached\n* daemon started successfully\n'), []);
  assert.deepEqual(parseDevices(''), []);
});

test('parseWmSize: physical size, an override wins', () => {
  assert.deepEqual(parseWmSize('Physical size: 1080x2400\n'), [1080, 2400]);
  assert.deepEqual(parseWmSize('Physical size: 1080x2400\nOverride size: 720x1600\n'), [720, 1600]);
  assert.equal(parseWmSize('error'), null);
});

const DUMP = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node index="0" text="" resource-id="" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]" enabled="true" focused="false">
 <node index="0" text="E-mailadres" resource-id="com.app:id/email_input" class="android.widget.EditText" content-desc="" enabled="true" focused="true" password="false" hint="E-mailadres" bounds="[60,600][1020,720]" />
 <node index="1" text="" resource-id="com.app:id/pw" class="android.widget.EditText" content-desc="Wachtwoord" enabled="true" focused="false" password="true" bounds="[60,760][1020,880]" />
 <node index="2" text="Jan" resource-id="com.app:id/first_name" class="android.widget.EditText" enabled="true" focused="false" password="false" bounds="[60,920][1020,1040]" />
 <node index="3" text="Zoek &amp; vind" resource-id="com.app:id/q" class="androidx.appcompat.widget.SearchView$SearchAutoComplete" enabled="true" focused="false" bounds="[60,1080][1020,1200]" />
 <node index="4" text="Uit beeld" resource-id="" class="android.widget.EditText" enabled="true" focused="false" bounds="[60,3000][1020,3120]" />
 <node index="5" text="Uitgeschakeld" resource-id="" class="android.widget.EditText" enabled="false" focused="false" bounds="[60,1240][1020,1360]" />
 <node index="6" text="Inloggen" resource-id="com.app:id/go" class="android.widget.Button" enabled="true" focused="false" bounds="[60,1400][1020,1520]" />
</node></hierarchy>`;

test('parseUiDump + fieldsFromDump: the text fields with their hints and positions in css pixels', () => {
  const nodes = parseUiDump(DUMP);
  assert.equal(nodes.length, 8);
  assert.deepEqual(nodes[1].bounds, [60, 600, 1020, 720]);
  assert.equal(nodes[4].text, 'Zoek & vind', 'XML entities are decoded');
  const fields = fieldsFromDump(nodes, 1080 / 390, [1080, 2400]);
  assert.deepEqual(fields.map(f => f.id), ['email_input', 'pw', 'first_name', 'q'], 'no buttons, nothing disabled or off screen');
  const [email, pw, first, search] = fields;
  assert.deepEqual([email.x, email.y].map(Math.round), [195, 238]); // (540, 660) device pixels ÷ 2.77
  assert.equal(email.placeholder, 'E-mailadres');
  assert.equal(email.value, '', 'the hint is not a value');
  assert.equal(email.focused, true);
  assert.equal(pw.type, 'password');
  assert.equal(first.value, 'Jan');
  assert.equal(search.type, 'search');
  // The hints work with the dataset matching.
  const d = defaultDatasets('nl')[0];
  assert.equal(pickValue(d, email).value, 'jan@voorbeeld.nl');
  assert.equal(pickValue(d, pw).value, 'demo-wachtwoord');
  assert.equal(pickValue(d, first).value, 'Jan');
});

test('escapeInputText: what `adb shell input text` needs', () => {
  assert.equal(escapeInputText(' '), '%s');
  assert.equal(escapeInputText('a'), 'a');
  assert.equal(escapeInputText('@'), '@');
  assert.equal(escapeInputText('&'), '\\&');
  assert.equal(escapeInputText('('), '\\(');
  assert.equal(escapeInputText("'"), "\\'");
  assert.equal(canTypeOverAdb('a'), true);
  assert.equal(canTypeOverAdb('é'), false);
  assert.equal(canTypeOverAdb('\n'), false);
});
