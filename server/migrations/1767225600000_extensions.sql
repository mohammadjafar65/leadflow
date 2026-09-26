-- up migration
create extension if not exists cube;
create extension if not exists earthdistance;

-- down migration
drop extension if exists earthdistance;
drop extension if exists cube;