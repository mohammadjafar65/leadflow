-- up migration
create table sequence_actions (
 enrollment_id uuid not null references sequence_enrollments(id) on delete cascade,
 step_order int not null,
 state text not null check(state in ('processing','sent','failed','unknown','skipped')),
 error text,
 updated_at timestamptz not null default now(),
 primary key(enrollment_id,step_order)
);
-- down migration
drop table if exists sequence_actions;
