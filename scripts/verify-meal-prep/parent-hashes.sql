select 'subject',md5(row_to_json(t)::text) from meal_prep_subject t order by id;
select 'revision',md5(row_to_json(t)::text) from meal_prep_revision t order by id;
select 'outbox',md5(row_to_json(t)::text) from meal_prep_outbox t order by id;
select 'availability',md5(row_to_json(t)::text) from availability_setting t order by id;
