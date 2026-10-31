select 'subject',md5(row_to_json(t)::text) from meal_prep_subject t order by id;
select 'revision',md5(row_to_json(t)::text) from meal_prep_revision t order by id;
select 'outbox',md5(row_to_json(t)::text) from meal_prep_outbox t order by id;
select 'availability',md5(row_to_json(t)::text) from availability_setting t order by id;
select 'capture',md5(row_to_json(t)::text) from meal_prep_capture t order by id;
select 'approval',md5(row_to_json(t)::text) from meal_prep_approval t order by id;
select 'approval_state',md5(row_to_json(t)::text) from meal_prep_approval_state t order by id;
