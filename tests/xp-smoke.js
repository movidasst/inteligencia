const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html','utf8');
const intelligence = fs.readFileSync('app-v4.js','utf8');
const xp = fs.readFileSync('xp.js','utf8');

new vm.Script(intelligence,{filename:'app-v4.js'});
new vm.Script(xp,{filename:'xp.js'});

assert.match(html,/data-view="xp"/);
assert.match(html,/id="view-xp"/);
assert.match(html,/<script src="app-v4\.js"><\/script>[\s\S]*<script src="xp\.js"><\/script>/);

const ids = [...new Set([...xp.matchAll(/\$xp\('([^']+)'\)/g)].map(x=>x[1]))];
for(const id of ids) assert.ok(html.includes('id="' + id + '"'), 'Missing XP UI ID: ' + id);

assert.match(html,/id="xpGrantBtn"[^>]*disabled/);
assert.match(html,/id="xpApplyBtn"[^>]*disabled/);
assert.match(xp,/admin_inteligencia_personas/);
assert.match(xp,/admin_calidad_integrante/);
assert.match(xp,/admin_calidad_otorgar_lote_v2/);
assert.match(xp,/admin_whatsapp_xp_previsualizar/);
assert.match(xp,/admin_whatsapp_xp_aplicar/);
assert.match(xp,/p_request_id:requestId/);
assert.match(xp,/if\(!confirm\(/);
assert.match(xp,/first\.sesion_tiene_historico/);
assert.match(xp,/first\.sesion_finalizada/);
assert.match(xp,/!r\.ya_otorgado/);
assert.match(intelligence,/openXpForPerson/);
console.log('XP smoke checks passed:',ids.length,'DOM IDs, 2 scripts, admin RPC safeguards.');