-- La bandeja se ordena por el último correo RECIBIDO (como Gmail): responder
-- no reordena el hilo. Realinea last_message_at al último inbound en los hilos
-- que tienen al menos un correo recibido (los enviados no lo mueven).
UPDATE "crm"."email_threads" t
SET "last_message_at" = sub.max_in
FROM (
  SELECT m."thread_id" AS tid, MAX(COALESCE(m."received_at", m."sent_at")) AS max_in
  FROM "crm"."email_messages" m
  WHERE m."direction" = 'in'
  GROUP BY m."thread_id"
) sub
WHERE sub.tid = t."id" AND sub.max_in IS NOT NULL;
