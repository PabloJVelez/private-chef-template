insert into meal_prep_subject(id,chef_id,customer_id,kind,version) values ('upgrade-arrangement','chef-default','customer-upgrade','arrangement',1);
insert into meal_prep_revision(id,subject_id,kind,revision_number,body,contract_version,created_by) values ('upgrade-draft','upgrade-arrangement','arrangement',1,'{"note":"existing private draft"}','1.1-r4','upgrade-chef');
insert into meal_prep_outbox(id,subject_id,revision_id,topic,deduplication_key,contract_version) values ('upgrade-event','upgrade-arrangement','upgrade-draft','meal_prep.revision_staged','upgrade-event','1.1-r4');
insert into availability_setting(id,timezone,weekly,overrides) values ('chef-default','UTC','{}','{"2027-01-01":[]}');
