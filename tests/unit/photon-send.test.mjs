import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flushPhoton } from '../../src/server/photon/service.ts';

test('outbox uses Photon 2.0 with a stable idempotency key and only acknowledges accepted sends',async t=>{
 const values={PHOTON_API_KEY:'pho_sk_test',PHOTON_PROJECT_ID:'pho_prj_test',PHOTON_AGENT_USER_ID:'pho_usr_agent',PHOTON_WEBHOOK_SECRET:'secret',PHOTON_IMESSAGE_ADDRESS:'+15551234567',SUPABASE_URL:'https://bookie-test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service-key'};
 const before={};for(const [key,value] of Object.entries(values)){before[key]=process.env[key];process.env[key]=value;}
 t.after(()=>{for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 let accepted=false;const sends=[];const acknowledgements=[];const claims=[];
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const url=String(input);
  if(url.endsWith('/rpc/photon_claim')) {claims.push(JSON.parse(init.body));return Response.json([{id:'queue-id',lease:'lease-id',space_id:'pho_spc_dm',body:'Result: YES'}]);}
  if(url.endsWith('/rpc/photon_ack')){acknowledgements.push(JSON.parse(init.body));return Response.json(null);}
  assert.equal(url,'https://api.photon.codes/v1/projects/pho_prj_test/messages');
  const headers=new Headers(init.headers);assert.equal(headers.get('authorization'),'Bearer pho_sk_test');assert.equal(headers.get('idempotency-key'),'bookie:queue-id');
  sends.push(JSON.parse(init.body));return Response.json({id:'pho_msg_test',status:'accepted'},{status:accepted?202:503});
 });
 await flushPhoton();assert.equal(acknowledgements.length,0);
 accepted=true;await flushPhoton("pho_spc_dm");assert.equal(acknowledgements.length,1);assert.deepEqual(sends[0],sends[1]);
 assert.deepEqual(sends[1],{spaceId:'pho_spc_dm',senderId:'pho_usr_agent',content:{type:'text',format:'plain',text:'Result: YES'}});
 assert.deepEqual(claims,[{p_project:'pho_prj_test'},{p_project:'pho_prj_test',p_space:'pho_spc_dm'}]);
 assert.deepEqual(acknowledgements[0],{p_id:'queue-id',p_lease:'lease-id'});
});
