import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Webhook } from 'standardwebhooks';
import { inboundMessage, verifyEvent, conversationalCommand } from '../../src/server/photon/protocol.ts';
const fixture=()=>({id:'evt1',type:'message.received',apiVersion:'2026-07-01',source:'imessage.photon',data:{projectId:'project',object:{id:'msg1',projectId:'project',platform:'imessage',status:'received',sentBy:{id:'player',platform:'imessage',projectId:'project'},space:{id:'space1',kind:'direct',projectId:'project',platform:'imessage',participantIds:['agent','player']},content:{type:'text',format:'plain',text:'RESULTS'}}}});
test('Photon Beta inbound text and grouped proof image are parsed',()=>{
 const e=fixture();assert.equal(inboundMessage(e,'project','agent').text,'RESULTS');
 e.data.object.content={type:'group',parts:[{type:'text',text:'PROOF 01234567 finished!'},{type:'attachment',attachmentId:'pho_att_0123456789'}]};
 const m=inboundMessage(e,'project','agent');assert.equal(m.attachmentId,'pho_att_0123456789');assert.equal(m.messageId,'msg1');
});
test('wrong projects, groups, bot echoes, unsupported versions and content are ignored',()=>{
 for(const change of [e=>e.data.projectId='other',e=>e.data.object.projectId='other',e=>e.data.object.space.projectId='other',e=>e.data.object.sentBy.projectId='other',e=>e.data.object.space.participantIds.push('third'),e=>e.data.object.space.kind='group',e=>e.data.object.receivedBy={id:'other-agent',projectId:'project',platform:'imessage'},e=>e.data.object.sentBy.id='agent',e=>e.apiVersion='legacy',e=>e.data.object.content={type:'voice'},e=>e.data.object.content.text='a'.repeat(2001)]){
  const e=fixture();change(e);assert.equal(inboundMessage(e,'project','agent'),null);
 }
});
test('Standard Webhooks validates exact body, rejects tampering, missing signatures and stale requests',()=>{
 const secret=`whsec_${Buffer.alloc(32,7).toString('base64')}`;
 const verifier=new Webhook(secret);const raw=JSON.stringify(fixture());
 const timestamp=new Date();const headers=new Headers({'webhook-id':'evt1','webhook-timestamp':String(Math.floor(timestamp.getTime()/1000)),'webhook-signature':verifier.sign('evt1',timestamp,raw)});
 assert.equal(verifyEvent(raw,headers,secret).id,'evt1');
 assert.throws(()=>verifyEvent(raw+' ',headers,secret));assert.throws(()=>verifyEvent(raw,new Headers(),secret));
 const old=new Date(Date.now()-600000);headers.set('webhook-timestamp',String(Math.floor(old.getTime()/1000)));headers.set('webhook-signature',verifier.sign('evt1',old,raw));assert.throws(()=>verifyEvent(raw,headers,secret));
});

test('short natural requests work without rewriting evidence',()=>{
 for(const phrase of ["Who's winning?",'show my results','How am I doing?'])assert.equal(conversationalCommand(phrase),'RESULTS');
 assert.equal(conversationalCommand('send proof'),'BETS');
 assert.equal(conversationalCommand('pause alerts'),'STOP');
 assert.equal(conversationalCommand('resume alerts'),'START');
 const note='My results show I finished the challenge';assert.equal(conversationalCommand(note),note);
 const e=fixture();e.data.object.content={type:'group',parts:[{type:'text',text:'results'},{type:'attachment',attachmentId:'pho_att_0123456789'}]};
 assert.equal(inboundMessage(e,'project','agent').text,'results');
});
