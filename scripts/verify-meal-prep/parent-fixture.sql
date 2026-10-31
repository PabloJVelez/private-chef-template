insert into meal_prep_subject(id,chef_id,customer_id,kind,version) values ('upgrade-arrangement','chef-default','customer-upgrade','arrangement',1);
insert into meal_prep_revision(id,subject_id,kind,revision_number,body,contract_version,created_by) values ('upgrade-draft','upgrade-arrangement','arrangement',1,'{"note":"existing private draft"}','1.1-r4','upgrade-chef');
insert into meal_prep_outbox(id,subject_id,revision_id,topic,deduplication_key,contract_version) values ('upgrade-event','upgrade-arrangement','upgrade-draft','meal_prep.revision_staged','upgrade-event','1.1-r4');
insert into availability_setting(id,timezone,weekly,overrides) values ('chef-default','UTC','{}','{"2027-01-01":[]}');
insert into meal_prep_capture(id,chef_id,customer_id,kind,version) values ('upgrade-household','chef-default','customer-upgrade','household',0);
insert into meal_prep_approval(id,subject_id,revision_id,revision_kind,decision,chef_actor_id,expected_version,contract_version)
  values ('upgrade-approval','upgrade-arrangement','upgrade-draft','arrangement','approved','upgrade-chef',1,'1.1-r4');
insert into meal_prep_approval_state(id,subject_id,revision_id,version,body) values ('upgrade-state','upgrade-arrangement','upgrade-draft',1,
  '{"householdId":"upgrade-household","arrangementRevisionId":"upgrade-draft","arrangementApproved":true,"candidate":null,"confirmedMenuRevisionId":null}');
-- PR6 populated financial history, created on the exact parent before PR7 upgrade.
insert into meal_prep_subject(id,chef_id,customer_id,kind,parent_id,parent_kind,generation_key,version)
 values ('upgrade-occurrence','chef-default','customer-upgrade','occurrence','upgrade-arrangement','arrangement','upgrade-generation',1);
insert into meal_prep_revision(id,subject_id,kind,revision_number,body,contract_version,created_by)
 values ('upgrade-menu','upgrade-occurrence','menu',1,'{"quote":{"status":"exact_review","currency":"USD","totalMinor":1000}}','1.1-r4','upgrade-chef');
insert into meal_prep_approval(id,subject_id,revision_id,revision_kind,decision,chef_actor_id,expected_version,contract_version)
 values ('upgrade-menu-approval','upgrade-occurrence','upgrade-menu','menu','approved','upgrade-chef',1,'1.1-r4');
insert into meal_prep_approval_state(id,subject_id,revision_id,version,body)
 values ('upgrade-occurrence-state','upgrade-occurrence','upgrade-menu',1,'{"householdId":"upgrade-household","arrangementRevisionId":"upgrade-draft","arrangementApproved":true,"candidate":{"generationKey":"upgrade-generation","occurrenceId":"upgrade-occurrence"},"confirmedMenuRevisionId":"upgrade-menu"}');
insert into meal_prep_billing_quote(id,subject_id,menu_revision_id,approval_version,chef_actor_id,account_id,currency,total_minor,components,policy_fixture,test_only)
 values ('upgrade-quote','upgrade-occurrence','upgrade-menu',1,'upgrade-chef','acct_upgrade','USD',1000,'[{"kind":"cooking","amountMinor":1000,"provenance":"upgrade-fixture"}]','test-only-unresolved-D04-D05-D10-D11',true);
insert into meal_prep_bill(id,subject_id,quote_id) values ('upgrade-bill','upgrade-occurrence','upgrade-quote');
insert into meal_prep_payment_attempt(id,bill_id,customer_id,actor_id,authorization_kind,idempotency_key,state,session_id,intent_id)
 values ('upgrade-attempt','upgrade-bill','customer-upgrade','customer-upgrade','pay_exact_quote_once','upgrade-payment','succeeded','cs_test_upgrade','pi_upgrade');
insert into meal_prep_payment_collection(id,bill_id,attempt_id,account_id,intent_id,total_minor,currency)
 values ('upgrade-collected','upgrade-bill','upgrade-attempt','acct_upgrade','pi_upgrade',1000,'USD');
insert into meal_prep_payment_event(id,account_id,event_id,attempt_id,payload_hash,observed_state)
 values ('upgrade-webhook','acct_upgrade','evt_upgrade','upgrade-attempt','upgrade-fixture-hash','succeeded');
insert into meal_prep_payment_notification(id,bill_id,state,attempts,delivered_at) values ('upgrade-notification','upgrade-bill','sent',1,now());
insert into meal_prep_commerce_resource(bill_id,kind,resource_id) values ('upgrade-bill','order','order_upgrade'),('upgrade-bill','collection','paycol_upgrade');
