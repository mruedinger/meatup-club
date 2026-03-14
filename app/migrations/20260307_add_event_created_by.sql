ALTER TABLE events ADD COLUMN created_by INTEGER REFERENCES users(id);

UPDATE events
SET created_by = (
  SELECT COALESCE(p.closed_by, p.created_by)
  FROM polls p
  WHERE p.created_event_id = events.id
  ORDER BY p.id DESC
  LIMIT 1
)
WHERE created_by IS NULL;
