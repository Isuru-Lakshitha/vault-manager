import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceBill } from '../src/utils/billSchedule.js';
test('monthly billing clamps February and restores the original anchor in March',()=>{
 const original={frequency:'Monthly',due_date:'2026-01-31'};
 const feb={...original,...advanceBill(original)};assert.equal(feb.due_date,'2026-02-28');
 assert.equal(advanceBill(feb).due_date,'2026-03-31');
});
test('leap years, weekly year boundaries and one-time payments',()=>{
 assert.equal(advanceBill({frequency:'Monthly',due_date:'2028-01-31'}).due_date,'2028-02-29');
 assert.equal(advanceBill({frequency:'Yearly',due_date:'2028-02-29'}).due_date,'2029-02-28');
 assert.equal(advanceBill({frequency:'Weekly',due_date:'2026-12-28'}).due_date,'2027-01-04');
 assert.deepEqual(advanceBill({frequency:'Once'}),{paid:true});
});
