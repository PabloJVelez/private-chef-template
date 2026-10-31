select 'subject',md5(row_to_json(t)::text) from meal_prep_subject t order by id;
select 'revision',md5(row_to_json(t)::text) from meal_prep_revision t order by id;
select 'outbox',md5(row_to_json(t)::text) from meal_prep_outbox t order by id;
select 'availability',md5(row_to_json(t)::text) from availability_setting t order by id;
select 'capture',md5(row_to_json(t)::text) from meal_prep_capture t order by id;
select 'approval',md5(row_to_json(t)::text) from meal_prep_approval t order by id;
select 'approval_state',md5(row_to_json(t)::text) from meal_prep_approval_state t order by id;
select 'billing_quote',md5(row_to_json(t)::text) from meal_prep_billing_quote t order by id;
select 'bill',md5(row_to_json(t)::text) from meal_prep_bill t order by id;
select 'payment_attempt',md5(row_to_json(t)::text) from meal_prep_payment_attempt t order by id;
-- PR8 changes no parent fields. Compare the complete financial row.
select 'payment_collection',md5(to_jsonb(t)::text) from meal_prep_payment_collection t order by id;
select 'payment_event',md5(row_to_json(t)::text) from meal_prep_payment_event t order by id;
select 'payment_notification',md5(row_to_json(t)::text) from meal_prep_payment_notification t order by id;
select 'commerce_resource',md5(row_to_json(t)::text) from meal_prep_commerce_resource t order by bill_id,kind;

select 'method_setup',md5(row_to_json(t)::text) from meal_prep_method_setup t order by id;
select 'method_invalidation',md5(row_to_json(t)::text) from meal_prep_method_invalidation t order by setup_id;
select 'autopay_consent',md5(row_to_json(t)::text) from meal_prep_autopay_consent t order by id;
select 'autopay_revocation',md5(row_to_json(t)::text) from meal_prep_autopay_revocation t order by consent_id;
select 'payment_trigger',md5(row_to_json(t)::text) from meal_prep_payment_trigger t order by id;
select 'autopay_attempt',md5(row_to_json(t)::text) from meal_prep_autopay_attempt t order by id;
select 'autopay_event',md5(row_to_json(t)::text) from meal_prep_autopay_event t order by id;
select 'notification_intent',md5(row_to_json(t)::text) from meal_prep_notification_intent t order by id;
select 'notification_dispatch',md5(row_to_json(t)::text) from meal_prep_notification_dispatch t order by id;
select 'notification_result',md5(row_to_json(t)::text) from meal_prep_notification_result t order by dispatch_id;
