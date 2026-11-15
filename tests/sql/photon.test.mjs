import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDb } from './harness.mjs';
let t,ana,ben,outsider,series,bet;
const code='0123456789abcdef01234567';
const one=async p=>(await p)[0];
const receive=(sender,message,text,attachment=null,space=`space-${sender}`)=>t.db.query('select photon_receive($1,$2,$3,$4,$5,$6)',['project',sender,space,message,text,attachment]);
before(async()=>{
 t=await createDb();ana=await t.user('Ana');ben=await t.user('Ben');outsider=await t.user('Outsider');
 series=await one(ana.rpc('create_bet_series',{p_title:'Photon game',p_description:'',p_planned_bet_count:1,p_initial_bankroll:1000,p_loser_count:1,p_stake_mode:'SHARED_FAVOR_POOL',p_questions:['Finish the project?'],p_settings:{}}));
 await ben.rpc('join_bet_series',{p_series_id:series.id});
 for(const p of [ana,ben])await p.rpc('propose_series_favor',{p_series_id:series.id,p_description:`${p.name} does dishes`});
 for(const p of [ana,ben])await p.rpc('set_series_ready',{p_series_id:series.id,p_ready:true});
 await ana.rpc('start_bet_series',{p_series_id:series.id});
 bet=(await t.db.query('select * from series_bets where series_id=$1',[series.id])).rows[0];
});
after(()=>t?.close());
test('pairing is private, one-use, expiring and cannot be claimed by another sender',async()=>{
 await ana.rpc('photon_pair',{p_hash:createHash('sha256').update(code).digest('hex')});
 await receive('ana','m1',`LINK ${code}`);
 assert.equal((await ana.rpc('photon_status'))[0].photon_status.connected,true);
 await receive('thief','m2',`LINK ${code}`);
 assert.equal((await t.db.query('select count(*)::int n from photon_connections')).rows[0].n,1);
 await ben.rpc('photon_pair',{p_hash:createHash('sha256').update(code).digest('hex')});
 await t.db.exec("update photon_pair_codes set expires_at=now()-interval '1 minute'");
 await receive('ben','m3',`LINK ${code}`);
 assert.equal((await ben.rpc('photon_status'))[0].photon_status.connected,false);
});
test('webhook-only RPCs and pairing data cannot be accessed by app users',async()=>{
 await assert.rejects(ana.rpc('photon_receive',{p_project:'project',p_sender:'ana',p_space:'space-ana',p_message:'hack',p_text:'RESULTS'}));
 await assert.rejects(ana.as('select * from photon_pair_codes'));
 await assert.rejects(ana.rpc('photon_claim',{p_project:'project'}));
});
test('proof text and images are saved once and visible only to game members',async()=>{
 await receive('ana','m4',`PROOF ${bet.id.slice(0,8)}`);
 await receive('ana','m5','Here is my screenshot','pho_att_example');
 await receive('ana','m5','Duplicate screenshot','pho_att_example');
 assert.equal((await ana.as('select * from photon_proofs')).length,1);
 assert.equal((await ben.as('select * from photon_proofs')).length,1);
 assert.equal((await outsider.as('select * from photon_proofs')).length,0);
 assert.equal((await t.db.query('select body from photon_outbox where event_key=$1',['m5'])).rows[0].body,'Proof saved for host review. The host still calls the result.');
 await receive('ana','wrong-space','RESULTS',null,'another-space');
 assert.equal((await t.db.query('select * from photon_outbox where event_key=$1',['wrong-space'])).rows.length,0);
});
test('invalid bet selections and expired context never attach proof to the prior bet',async()=>{
 await receive('ana','invalid-select','PROOF 00000000');
 await receive('ana','after-invalid','Wrong evidence','pho_att_wrong');
 assert.equal((await t.db.query('select count(*)::int n from photon_proofs')).rows[0].n,1);
 await receive('ana','select-again',`PROOF ${bet.id.slice(0,8)}`);
 await t.db.exec("update photon_connections set selected_until=now()-interval '1 second'");
 await receive('ana','expired-context','Late evidence','pho_att_late');
 assert.equal((await t.db.query('select count(*)::int n from photon_proofs')).rows[0].n,1);
});
test('BETS and RESULTS are account scoped, and STOP pauses alerts',async()=>{
 await receive('ana','m6','BETS');await receive('ana','m7','RESULTS');
 const rows=(await t.db.query('select body from photon_outbox where event_key in ($1,$2) order by event_key',['m6','m7'])).rows;
 assert.match(rows[0].body,new RegExp(bet.id.slice(0,8)));assert.match(rows[1].body,/Photon game/);
 await receive('ana','m8','STOP');assert.equal((await ana.rpc('photon_status'))[0].photon_status.alerts,false);
 await receive('ana','m9','START');
});
test('settlement queues one opt-in result, leases cannot double send, and disconnect clears pending sends',async()=>{
 await ana.rpc('place_series_wager',{p_series_id:series.id,p_bet_id:bet.id,p_outcome:'YES',p_amount:100});
 await ben.rpc('place_series_wager',{p_series_id:series.id,p_bet_id:bet.id,p_outcome:'NO',p_amount:100});
 await ana.rpc('finish_series_bet',{p_series_id:series.id,p_bet_id:bet.id,p_outcome:'YES'});
 const result=(await t.db.query("select * from photon_outbox where kind='result'")).rows;
 assert.equal(result.length,1);assert.match(result[0].body,/Result: YES/);assert.match(result[0].body,/1100 coins/);
 const leased=(await t.db.query("select * from photon_claim('project')")).rows;
 assert.ok(leased.length>0);
 const next=(await t.db.query("select * from photon_claim('project')")).rows;
 assert.ok(next.every(row=>!leased.some(prior=>prior.id===row.id)));
 assert.equal((await t.db.query("select * from photon_claim('project')")).rows.length,0);
 await t.db.query('select photon_ack($1,$2)',[leased[0].id,crypto.randomUUID()]);
 assert.equal((await t.db.query('select sent_at from photon_outbox where id=$1',[leased[0].id])).rows[0].sent_at,null);
 await t.db.query('select photon_ack($1,$2)',[leased[0].id,leased[0].lease]);
 assert.ok((await t.db.query('select sent_at from photon_outbox where id=$1',[leased[0].id])).rows[0].sent_at);
 await ana.rpc('photon_disconnect');assert.equal((await t.db.query('select * from photon_outbox')).rows.length,0);
});

test('interactive replies get priority over alert backlogs and immediate flush is chat scoped',async()=>{
 const priorityCode='ab'.repeat(12);
 const hash=createHash('sha256').update(priorityCode).digest('hex');
 await ana.rpc('photon_pair',{p_hash:hash});await receive('ana','priority-link',`LINK ${priorityCode}`);
 await ben.rpc('photon_pair',{p_hash:hash});await receive('ben','other-link',`LINK ${priorityCode}`);
 await t.db.exec("delete from photon_outbox");
 await t.db.exec(`insert into photon_outbox(connection_id,event_key,body,kind,created_at)
  select c.id,'old-alert-'||n,'Old result','result',now()-interval '1 hour' from photon_connections c cross join generate_series(1,12) n;
  insert into photon_outbox(connection_id,event_key,body,kind) select id,'interactive','Your current standings','reply' from photon_connections where sender_id='ana';`);
 const rows=(await t.db.query("select * from photon_claim('project','space-ana')")).rows;
 assert.equal(rows.length,10);assert.ok(rows.some(r=>r.body==='Your current standings'));
 assert.ok(rows.every(r=>r.space_id==='space-ana'));
 assert.equal((await t.db.query("select count(*)::int n from photon_outbox o join photon_connections c on c.id=o.connection_id where c.sender_id='ben' and o.lease is not null")).rows[0].n,0);
 const global=(await t.db.query("select * from photon_claim('project')")).rows;
 assert.ok(global.some(r=>r.space_id==='space-ben'));
});
