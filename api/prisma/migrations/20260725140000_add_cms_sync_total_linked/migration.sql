ALTER TABLE "cms_sync_runs" ADD COLUMN "total_linked" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "crawl_runs" ADD COLUMN "total_linked" INTEGER NOT NULL DEFAULT 0;

UPDATE "cms_sync_runs" AS r
SET "total_linked" = sub.linked_count
FROM (
  SELECT
    csr.id,
    COUNT(*)::int AS linked_count
  FROM "cms_sync_runs" csr
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(csr.response->'operation_results', '[]'::jsonb)
  ) AS op
  WHERE (op->>'skipped_push') = 'true'
    AND COALESCE((op->>'success')::boolean, true)
  GROUP BY csr.id
) AS sub
WHERE r.id = sub.id;

UPDATE "crawl_runs" AS cr
SET "total_linked" = sub.linked_sum
FROM (
  SELECT
    crawl_run_id,
    COALESCE(SUM(total_linked), 0)::int AS linked_sum
  FROM "cms_sync_runs"
  WHERE crawl_run_id IS NOT NULL
  GROUP BY crawl_run_id
) AS sub
WHERE cr.id = sub.crawl_run_id;
