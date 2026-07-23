-- No-op: this migration originally renamed a truncated unique index name, but it is
-- ordered before integration_properties is created (20260723070000), so replaying it
-- on a shadow database fails. The later user_property FK migration replaces this index.
SELECT 1;
