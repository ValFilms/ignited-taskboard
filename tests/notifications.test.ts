import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationQueue} from '../lib/notification-queue';
const notices=Array.from({length:6},(_,i)=>({id:String(i),userId:'owner',clientId:'client',text:'Notification '+i,createdAt:new Date(i).toISOString(),read:false}));
test('existing unread backlog remains in inbox without popups on sign-in',()=>{assert.equal(notificationQueue(notices,null,[]).items.length,0);});
test('new notifications show only the latest three and never duplicate during polling',()=>{
  let q=notificationQueue([notices[0]],null,[]);q=notificationQueue(notices,q.seen,q.items);assert.deepEqual(q.items.map(n=>n.id),['3','4','5']);assert.deepEqual(notificationQueue(notices,q.seen,q.items).items,q.items);
});
test('dismissed popup stays unread and does not reappear on next refresh',()=>{
  let q=notificationQueue([],null,[]);q=notificationQueue([notices[0]],q.seen,[]);assert.equal(q.items.length,1);q=notificationQueue([notices[0]],q.seen,[]);assert.equal(q.items.length,0);assert.equal(notices[0].read,false);
});
test('read and inaccessible notifications leave popup queue',()=>{
  const q=notificationQueue(notices,new Set(),[]);assert.equal(notificationQueue(notices.map(n=>({...n,read:true})),q.seen,q.items).items.length,0);assert.equal(notificationQueue([],q.seen,q.items).items.length,0);
});
test('switching users resets notification baseline',()=>{const q=notificationQueue(notices,null,[notices[0]]);assert.equal(q.items.length,0);});
